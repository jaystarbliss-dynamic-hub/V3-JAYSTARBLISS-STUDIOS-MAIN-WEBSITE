import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
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
  Minimize2,
  Sun,
  Moon,
  Sparkles,
  RefreshCw,
  Settings,
  FileCode2,
  Check,
  Pencil,
  SlidersHorizontal,
  Zap,
  Pause,
  Play,
  Search,
  X,
} from 'lucide-react';
import { CODING_LAB_CONFIG } from '../../config/codingLabConfig';
import type {
  CodingLabAssetManifestEntry,
  CodingLabAssessmentConfig,
  CodingLabMode,
  CodingLabSaveState,
  CodingLabSubmissionRecord,
  CodingLabThemeMode,
} from '../../types/codingLab';
import {
  buildLocalDraftKey,
  clearLocalDraft,
  loadLocalDraft,
  markLocalDraftSynced,
  pruneLocalDrafts,
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

const CodingLabAmbientShader = lazy(() => import('./CodingLabAmbientShader'));

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
  fullViewport?: boolean;
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

function generateSessionNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function readStoredLabTheme(): CodingLabThemeMode {
  if (typeof window === 'undefined') return CODING_LAB_CONFIG.defaultTheme;
  try {
    const raw = window.localStorage.getItem(CODING_LAB_CONFIG.themeStorageKey);
    if (raw === 'light' || raw === 'dark' || raw === 'glass') return raw;
  } catch {
    // Ignore restricted storage environments
  }
  return CODING_LAB_CONFIG.defaultTheme;
}

function persistLabTheme(theme: CodingLabThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CODING_LAB_CONFIG.themeStorageKey, theme);
  } catch {
    // Ignore restricted storage environments
  }
}

export const CodingLabEditorHost: React.FC<CodingLabEditorHostProps> = ({
  mode,
  readOnly = false,
  fullViewport = false,
  initialTitle,
  initialSb3Buffer,
  assessmentContext,
  onExit,
  exitLabel,
  fullscreenUrl,
  onSubmitted,
  onProjectJsonSnapshot,
}) => {
  const hostRootRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCallsRef = useRef<Map<string, PendingBridgeCall>>(new Map());
  const localDebounceRef = useRef<number | null>(null);
  const cloudDebounceRef = useRef<number | null>(null);
  const lastSavedCompositeHashRef = useRef<string | null>(null);
  const currentChunkHashesRef = useRef<string[]>([]);
  const currentRevisionRef = useRef<number>(0);
  const currentManifestRef = useRef<CodingLabAssetManifestEntry[]>([]);
  const hydratedRef = useRef<boolean>(false);
  const sessionNonceRef = useRef<string>(generateSessionNonce());
  const deadlineInitializedRef = useRef<boolean>(false);
  const autoExpireTriggeredRef = useRef<boolean>(false);

  const [labTheme, setLabTheme] = useState<CodingLabThemeMode>(() => readStoredLabTheme());
  const [frameSrcBase, setFrameSrcBase] = useState<string>(CODING_LAB_CONFIG.editorFrameUrl);
  const [reloadCounter, setReloadCounter] = useState<number>(0);
  const [editorReady, setEditorReady] = useState(false);
  const [handshakeTimedOut, setHandshakeTimedOut] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [projectTitle, setProjectTitle] = useState<string>(
    initialTitle || assessmentContext?.title || 'Untitled Coding Project'
  );
  const [saveState, setSaveState] = useState<CodingLabSaveState>(
    readOnly ? 'submitted_locked' : 'idle'
  );
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
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [openMenu, setOpenMenu] = useState<'settings' | 'file' | 'edit' | null>(null);
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const [turboSettings, setTurboSettings] = useState({
    turboMode: false,
    fps60: false,
    removeFencing: false,
    infiniteClones: false,
    removeLimits: false,
  });
  const [stagePaused, setStagePaused] = useState(false);
  const menuBarRef = useRef<HTMLDivElement | null>(null);

  const effectiveReadOnly = readOnly || submittedLocked;

  // Close Settings/File dropdown menus on outside click or Escape key
  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  const localDraftKey = buildLocalDraftKey({
    mode,
    ownerUid: assessmentContext?.ownerUid,
    assessmentId: assessmentContext?.assessmentId,
    attemptId: assessmentContext?.attemptId,
  });

  const handleSelectTheme = useCallback((nextTheme: CodingLabThemeMode) => {
    setLabTheme(nextTheme);
    persistLabTheme(nextTheme);
  }, []);

  // Hide global overlays (such as FloatingWhatsApp) while Coding Lab is mounted
  useEffect(() => {
    mountedCodingLabInstances += 1;
    if (typeof document !== 'undefined') {
      document.body.dataset.codingLabActive = '1';
      window.dispatchEvent(new Event('jdi-coding-lab-visibility'));
    }
    // Routine bounded IndexedDB hygiene on mount (never touches active/unsynced learner drafts)
    void pruneLocalDrafts({
      protectKey: localDraftKey,
      activeOwnerUid: assessmentContext?.ownerUid,
    });
    return () => {
      mountedCodingLabInstances = Math.max(0, mountedCodingLabInstances - 1);
      if (typeof document !== 'undefined' && mountedCodingLabInstances === 0) {
        delete document.body.dataset.codingLabActive;
        window.dispatchEvent(new Event('jdi-coding-lab-visibility'));
      }
    };
  }, [localDraftKey, assessmentContext?.ownerUid]);

  // Track browser fullscreen changes
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onFsChange = () => {
      setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleBrowserFullscreen = async () => {
    if (typeof document === 'undefined') return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (hostRootRef.current?.requestFullscreen) {
        await hostRootRef.current.requestFullscreen();
      }
    } catch {
      // Ignore unsupported fullscreen environments
    }
  };

  // Handshake timeout watchdog so learners never get stuck on an infinite spinner
  useEffect(() => {
    if (editorReady) {
      setHandshakeTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => {
      if (!editorReady) {
        setHandshakeTimedOut(true);
      }
    }, CODING_LAB_CONFIG.handshakeTimeoutMs);
    return () => window.clearTimeout(timer);
  }, [editorReady, reloadCounter, frameSrcBase]);

  // Assessment countdown timer (strictly isolated from native exam expiry!)
  useEffect(() => {
    if (mode !== 'assessment' || !assessmentContext?.deadlineAt || effectiveReadOnly) {
      setRemainingSeconds(null);
      deadlineInitializedRef.current = false;
      return;
    }
    const deadlineMs = Date.parse(assessmentContext.deadlineAt);
    if (!Number.isFinite(deadlineMs)) return;

    const tick = () => {
      const diff = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));
      setRemainingSeconds(diff);
      deadlineInitializedRef.current = true;
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
        win.postMessage(
          { type, requestId, nonce: sessionNonceRef.current, ...payload },
          window.location.origin,
          transfer
        );
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

  const hasValidStageInSb3 = useCallback(
    async (buffer: ArrayBuffer): Promise<boolean> => {
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
    },
    [mode]
  );

  // Save working copy to IndexedDB (device-local recovery only)
  const persistLocalRecovery = useCallback(async () => {
    if (!editorReady || effectiveReadOnly) return;
    try {
      setSaveState((prev) =>
        prev === 'uploading_assets' || prev === 'saving_lms' || prev === 'submitted_locked'
          ? prev
          : 'saving_local'
      );
      const { sb3Buffer, projectJsonString } = await exportCurrentSb3();

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
        syncedToCloud: false,
        assessmentId: assessmentContext?.assessmentId,
        attemptId: assessmentContext?.attemptId,
        ownerUid: assessmentContext?.ownerUid,
      });
      if (onProjectJsonSnapshot && parsedSnapshot) {
        onProjectJsonSnapshot(parsedSnapshot);
      }
      setSaveState((prev) =>
        prev === 'uploading_assets' ||
        prev === 'saving_lms' ||
        prev === 'saved_lms' ||
        prev === 'submitted_locked'
          ? prev
          : 'saved_local'
      );
    } catch {
      // Local recovery failure should not interrupt editing
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
        await persistLocalRecovery();
        setSaveState('offline_pending');
        setSaveMessage('Offline — changes saved on this device. Cloud sync pending.');
        return false;
      }

      setErrorBanner('');
      try {
        const { sb3Buffer } = await exportCurrentSb3();
        const localHash = await sha256Hex(new Uint8Array(sb3Buffer));
        await saveLocalDraft({
          key: localDraftKey,
          mode: 'assessment',
          title: projectTitle,
          sb3Buffer,
          projectHash: localHash,
          savedAt: new Date().toISOString(),
          syncedToCloud: false,
          assessmentId: assessmentContext.assessmentId,
          attemptId: assessmentContext.attemptId,
          ownerUid: assessmentContext.ownerUid,
        }).catch(() => undefined);

        const projectId =
          assessmentContext.initialProjectId ||
          buildAssessmentProjectId(assessmentContext.assessmentId, assessmentContext.attemptId);

        // Even on manual Save Progress, pass lastSavedCompositeHash so unchanged state causes 0 Firestore writes!
        const result = await saveAssessmentProjectToFirestore({
          projectId,
          ownerUid: assessmentContext.ownerUid,
          assessmentId: assessmentContext.assessmentId,
          attemptId: assessmentContext.attemptId,
          schoolId: assessmentContext.schoolId,
          title: projectTitle,
          sb3Buffer,
          existingRevision: currentRevisionRef.current,
          lastSavedCompositeHash: force && !lastSavedCompositeHashRef.current
            ? null
            : lastSavedCompositeHashRef.current,
          existingManifest: currentManifestRef.current,
          existingChunkHashes: currentChunkHashesRef.current,
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
        currentChunkHashesRef.current = result.chunkHashes;
        await markLocalDraftSynced(localDraftKey).catch(() => undefined);

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
    [
      mode,
      assessmentContext,
      effectiveReadOnly,
      exportCurrentSb3,
      localDraftKey,
      projectTitle,
      persistLocalRecovery,
    ]
  );

  // Schedule dirty state + local recovery + debounced 25s cloud autosave on Scratch VM changes
  const handleEditorProjectChanged = useCallback(() => {
    if (effectiveReadOnly || !hydratedRef.current) return;

    setSaveState((prev) =>
      prev === 'uploading_assets' || prev === 'saving_lms' || prev === 'submitted_locked'
        ? prev
        : 'dirty'
    );

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

  // Listen to hardened same-origin postMessage events from the self-hosted editor iframe
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const msg = event.data;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

      if (msg.type === 'CODING_LAB_HANDSHAKE_ACK') {
        if (msg.nonce && msg.nonce !== sessionNonceRef.current) return;
        return;
      }

      if (msg.type === 'CODING_LAB_READY') {
        setEditorReady(true);
        setHandshakeTimedOut(false);
        return;
      }

      if (msg.type === 'CODING_LAB_PROJECT_CHANGED') {
        handleEditorProjectChanged();
        return;
      }

      if (msg.type === 'CODING_LAB_TURBO_STATE' && msg.state && typeof msg.state === 'object') {
        setTurboSettings((prev) => ({
          turboMode:
            typeof msg.state.turboMode === 'boolean' ? msg.state.turboMode : prev.turboMode,
          fps60: typeof msg.state.fps60 === 'boolean' ? msg.state.fps60 : prev.fps60,
          removeFencing:
            typeof msg.state.removeFencing === 'boolean'
              ? msg.state.removeFencing
              : prev.removeFencing,
          infiniteClones:
            typeof msg.state.infiniteClones === 'boolean'
              ? msg.state.infiniteClones
              : prev.infiniteClones,
          removeLimits:
            typeof msg.state.removeLimits === 'boolean'
              ? msg.state.removeLimits
              : prev.removeLimits,
        }));
        if (typeof msg.state.paused === 'boolean') {
          setStagePaused(msg.state.paused);
        }
        return;
      }

      if (msg.type === 'CODING_LAB_RESPONSE' && typeof msg.requestId === 'string') {
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
      pendingCallsRef.current.forEach((p) => {
        window.clearTimeout(p.timer);
      });
      pendingCallsRef.current.clear();
    };
  }, [handleEditorProjectChanged]);

  // Sync readOnly state into the editor frame
  useEffect(() => {
    if (!editorReady) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'CODING_LAB_SET_READ_ONLY',
        nonce: sessionNonceRef.current,
        readOnly: effectiveReadOnly,
      },
      window.location.origin
    );
  }, [editorReady, effectiveReadOnly]);

  // Sync Coding Lab visual mode (Light / Dark / Glass) immediately into editor iframe
  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      {
        type: 'CODING_LAB_SET_THEME',
        nonce: sessionNonceRef.current,
        theme: labTheme,
      },
      window.location.origin
    );
  }, [labTheme, editorReady]);

  // Sync TurboWarp runtime settings into editor iframe whenever changed or ready
  const pushTurboSettings = useCallback(
    (nextSettings: typeof turboSettings) => {
      setTurboSettings(nextSettings);
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: 'CODING_LAB_SET_TURBO_SETTINGS',
          nonce: sessionNonceRef.current,
          settings: nextSettings,
        },
        window.location.origin
      );
    },
    []
  );

  useEffect(() => {
    if (!editorReady) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'CODING_LAB_SET_TURBO_SETTINGS',
        nonce: sessionNonceRef.current,
        settings: turboSettings,
      },
      window.location.origin
    );
  }, [editorReady, turboSettings]);

  const handleToggleStagePause = () => {
    const nextPaused = !stagePaused;
    setStagePaused(nextPaused);
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'CODING_LAB_TOGGLE_PAUSE',
        nonce: sessionNonceRef.current,
        paused: nextPaused,
      },
      window.location.origin
    );
  };

  const handleFocusFindBar = () => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'CODING_LAB_FOCUS_FIND',
        nonce: sessionNonceRef.current,
      },
      window.location.origin
    );
  };

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

        // Priority 2: Assessment mode -> Load cloud draft from Firestore, else local recovery, else starter project
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
            lastSavedCompositeHashRef.current = cloudLoaded.record.compositeHash || null;
            currentChunkHashesRef.current = Array.isArray(cloudLoaded.record.chunkHashes)
              ? cloudLoaded.record.chunkHashes
              : [];
            if (cloudLoaded.record.title) setProjectTitle(cloudLoaded.record.title);
            if (cloudLoaded.record.status === 'submitted') {
              setSubmittedLocked(true);
              setSaveState('submitted_locked');
            }

            // If a newer un-synced local recovery copy exists on this device for an active draft, prefer it
            if (
              !readOnly &&
              cloudLoaded.record.status !== 'submitted' &&
              localDraft?.sb3Buffer &&
              localDraft.projectHash &&
              localDraft.syncedToCloud !== true
            ) {
              const cloudTime =
                typeof (cloudLoaded.record.updatedAt as any)?.toMillis === 'function'
                  ? (cloudLoaded.record.updatedAt as any).toMillis()
                  : 0;
              const localTime = Date.parse(localDraft.savedAt || '');
              if (Number.isFinite(localTime) && localTime > cloudTime + 3000) {
                const draftValid = await hasValidStageInSb3(localDraft.sb3Buffer);
                if (!cancelled && draftValid) {
                  await loadSb3IntoEditor(localDraft.sb3Buffer);
                  setRecoveryBanner(
                    'Recovered newer unsaved changes from this device. Click Save Progress to sync to the LMS.'
                  );
                  setSaveState('saved_local');
                  hydratedRef.current = true;
                  return;
                }
              }
            }

            await loadSb3IntoEditor(cloudLoaded.sb3Buffer);
            if (cloudLoaded.record.status !== 'submitted') {
              setSaveState('saved_lms');
              setSaveMessage(`Loaded from LMS (rev ${cloudLoaded.record.revision})`);
            }
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
            await clearLocalDraft(localDraftKey).catch(() => undefined);
          }

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

        // Priority 3: Playground mode -> Check local IndexedDB recovery only (ZERO Firestore calls)
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
  }, [
    editorReady,
    mode,
    readOnly,
    initialSb3Buffer,
    assessmentContext,
    localDraftKey,
    loadSb3IntoEditor,
    hasValidStageInSb3,
  ]);

  // Retry online sync if browser regains network in Assessment mode
  useEffect(() => {
    if (mode !== 'assessment' || effectiveReadOnly) return;
    const handleOnline = () => {
      if (saveState === 'offline_pending' || saveState === 'error') {
        void saveToLmsCloud(false);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [mode, effectiveReadOnly, saveState, saveToLmsCloud]);

  // Unified submission helper (used by manual Confirm Submission and isolated deadline expiry)
  const executeCodingLabSubmit = useCallback(
    async (expiredAutoSubmit = false) => {
      if (mode !== 'assessment' || !assessmentContext || effectiveReadOnly || submitting) return;
      setSubmitting(true);
      setErrorBanner('');
      try {
        const { sb3Buffer } = await exportCurrentSb3();
        // Always persist local recovery snapshot before attempting network submission
        const localHash = await sha256Hex(new Uint8Array(sb3Buffer));
        await saveLocalDraft({
          key: localDraftKey,
          mode: 'assessment',
          title: projectTitle,
          sb3Buffer,
          projectHash: localHash,
          savedAt: new Date().toISOString(),
          syncedToCloud: false,
          assessmentId: assessmentContext.assessmentId,
          attemptId: assessmentContext.attemptId,
          ownerUid: assessmentContext.ownerUid,
        }).catch(() => undefined);

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
          existingChunkHashes: currentChunkHashesRef.current,
          lastSavedCompositeHash: lastSavedCompositeHashRef.current,
          expiredAutoSubmit,
          onStageChange: (stage) => {
            setSaveState(stage);
            setSaveMessage(
              stage === 'uploading_assets'
                ? 'Uploading custom images...'
                : expiredAutoSubmit
                ? 'Time elapsed — saving & locking submission...'
                : 'Saving & locking submission...'
            );
          },
        });

        setSubmittedLocked(true);
        setShowSubmitConfirm(false);
        setSaveState('submitted_locked');
        setSaveMessage(expiredAutoSubmit ? 'Time elapsed — submitted & locked' : 'Submitted & locked');
        onSubmitted?.(submission);
      } catch (err) {
        setShowSubmitConfirm(false);
        setSaveState(
          typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline_pending' : 'error'
        );
        setErrorBanner(
          err instanceof Error
            ? err.message
            : 'Submission failed because cloud save could not be verified. Your project is safe on this device—please retry.'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      mode,
      assessmentContext,
      effectiveReadOnly,
      submitting,
      exportCurrentSb3,
      localDraftKey,
      projectTitle,
      onSubmitted,
    ]
  );

  // Isolated Coding Lab timer expiry workflow (NEVER delegates to native exam send("expire"))
  useEffect(() => {
    if (
      mode !== 'assessment' ||
      !assessmentContext?.deadlineAt ||
      effectiveReadOnly ||
      !editorReady ||
      !hydratedRef.current ||
      !deadlineInitializedRef.current ||
      remainingSeconds === null ||
      remainingSeconds > 0 ||
      autoExpireTriggeredRef.current ||
      submitting
    ) {
      return;
    }

    const deadlineMs = Date.parse(assessmentContext.deadlineAt);
    if (!Number.isFinite(deadlineMs) || Date.now() < deadlineMs) return;

    autoExpireTriggeredRef.current = true;
    setRecoveryBanner(
      'Assessment timer reached 00:00. Saving your local copy and submitting your latest Coding Lab project...'
    );
    void executeCodingLabSubmit(true);
  }, [
    mode,
    assessmentContext?.deadlineAt,
    effectiveReadOnly,
    editorReady,
    remainingSeconds,
    submitting,
    executeCodingLabSubmit,
  ]);

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
      // Fallback: if editor isn't ready, try downloading the local IndexedDB recovery draft
      const recovery = await loadLocalDraft(localDraftKey).catch(() => null);
      if (recovery?.sb3Buffer) {
        downloadSb3File(recovery.sb3Buffer, recovery.title || projectTitle || 'coding-lab-recovery');
        return;
      }
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
      setSaveState('dirty');
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
    sessionNonceRef.current = generateSessionNonce();
    setProjectTitle('Untitled Coding Project');
    setRecoveryBanner('');
    setSaveState('idle');
    setSaveMessage('');
    setEditorReady(false);
    setHandshakeTimedOut(false);
    setReloadCounter((c) => c + 1);
  };

  const handleRetryEditorLoad = () => {
    // If configured for turbowarp and it failed to load, safely fall back to self-hosted scratch bundle
    if (frameSrcBase !== CODING_LAB_CONFIG.editorFrameFallbackUrl) {
      setFrameSrcBase(CODING_LAB_CONFIG.editorFrameFallbackUrl);
    }
    sessionNonceRef.current = generateSessionNonce();
    hydratedRef.current = false;
    setEditorReady(false);
    setHandshakeTimedOut(false);
    setReloadCounter((c) => c + 1);
  };

  const formatTimer = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const isLight = labTheme === 'light';
  const isDark = labTheme === 'dark';
  const isGlass = labTheme === 'glass';

  // Scoped outer-shell theme classes (strictly isolated from global portal theme)
  // Dark mode uses true TurboWarp Matte Black (#111111 / #1A1A1A / #242424)
  const rootThemeClass = isLight
    ? 'bg-[#e8edf5] text-slate-900 border-slate-200'
    : isDark
    ? 'bg-[#111111] text-[#eeeeee] border-[#2e2e2e]'
    : 'bg-[#090D16] text-slate-100 border-slate-200/15';

  // Authentic TurboWarp top menu bar (#FF4C4C in Light, true Matte Black #222222 in Dark, frosted crimson-slate in Glass)
  const headerThemeClass = isLight
    ? 'bg-[#FF4C4C] border-[#e03e3e] text-white'
    : isDark
    ? 'bg-[#222222] border-[#333333] text-[#f5f5f5]'
    : 'bg-[#7f1d1d]/80 backdrop-blur-md border-white/15 text-white shadow-[0_1px_0_rgba(248,250,252,0.08)]';

  const menuDropdownClass = isLight
    ? 'bg-white border-slate-200 text-slate-800 shadow-xl'
    : isDark
    ? 'bg-[#1e1e1e] border-[#333333] text-[#eeeeee] shadow-2xl'
    : 'bg-slate-900/95 backdrop-blur-md border-white/15 text-slate-100 shadow-2xl';

  const menuItemHoverClass = isLight
    ? 'hover:bg-slate-100'
    : isDark
    ? 'hover:bg-[#2a2a2a]'
    : 'hover:bg-white/10';

  const secondaryBtnClass = isLight
    ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
    : isDark
    ? 'border-[#333333] bg-[#242424] text-[#eeeeee] hover:bg-[#2e2e2e]'
    : 'border-slate-200/20 bg-slate-800/55 backdrop-blur-sm text-slate-100 hover:bg-slate-700/65';

  const subtleBarClass = isLight
    ? 'bg-slate-100/95 border-slate-200 text-slate-600'
    : isDark
    ? 'bg-[#181818] border-[#2e2e2e] text-[#b3b3b3]'
    : 'bg-slate-900/65 backdrop-blur-md border-slate-200/15 text-slate-300';

  const briefPanelClass = isLight
    ? 'bg-white border-slate-200 text-slate-700'
    : isDark
    ? 'bg-[#1a1a1a] border-[#2e2e2e] text-[#e5e5e5]'
    : 'bg-slate-900/75 backdrop-blur-md border-slate-200/15 text-slate-100';

  const renderSaveStatus = (inRedHeader = false) => {
    const baseText = inRedHeader
      ? 'text-white/90'
      : isLight
      ? 'text-slate-600'
      : 'text-[#b3b3b3]';
    if (effectiveReadOnly || saveState === 'submitted_locked') {
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md ${
            inRedHeader
              ? 'bg-black/20 text-white border border-white/20'
              : isLight
              ? 'text-slate-700 bg-slate-100'
              : 'text-[#eeeeee] bg-[#242424] border border-[#333333]'
          }`}
        >
          <Lock size={13} />
          {readOnly ? 'Read-Only Review' : 'Submitted (Locked)'}
        </span>
      );
    }

    switch (saveState) {
      case 'dirty':
        return (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              inRedHeader ? 'text-amber-100' : isLight ? 'text-amber-700' : 'text-amber-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-300 shrink-0" />
            Unsaved changes
          </span>
        );
      case 'saving_local':
        return (
          <span className={`inline-flex items-center gap-1.5 text-xs ${baseText}`}>
            <Loader2 size={13} className="animate-spin" />
            Saving locally...
          </span>
        );
      case 'saved_local':
        return (
          <span className={`inline-flex items-center gap-1.5 text-xs ${baseText}`}>
            <HardDrive size={13} className="opacity-80" />
            {mode === 'playground'
              ? 'Saved locally'
              : 'Saved locally (LMS sync pending)'}
          </span>
        );
      case 'uploading_assets':
        return (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              inRedHeader ? 'text-white' : isLight ? 'text-sky-700' : 'text-sky-300'
            }`}
          >
            <Loader2 size={13} className="animate-spin" />
            Uploading images...
          </span>
        );
      case 'saving_lms':
        return (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              inRedHeader ? 'text-white' : isLight ? 'text-sky-700' : 'text-sky-300'
            }`}
          >
            <Loader2 size={13} className="animate-spin" />
            Saving to LMS...
          </span>
        );
      case 'saved_lms':
        return (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              inRedHeader ? 'text-emerald-100' : isLight ? 'text-emerald-700' : 'text-emerald-400'
            }`}
          >
            <Cloud size={13} />
            {saveMessage || 'Saved to LMS'}
          </span>
        );
      case 'offline_pending':
        return (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              inRedHeader ? 'text-amber-100' : isLight ? 'text-amber-700' : 'text-amber-300'
            }`}
          >
            <CloudOff size={13} />
            Offline — sync pending
          </span>
        );
      case 'error':
        return (
          <span
            className={`inline-flex items-center gap-2 text-xs font-medium ${
              inRedHeader ? 'text-white' : isLight ? 'text-red-700' : 'text-red-300'
            }`}
          >
            <AlertCircle size={13} />
            Save failed
            {mode === 'assessment' && (
              <button
                type="button"
                onClick={() => void saveToLmsCloud(false)}
                className="underline font-semibold hover:opacity-80 cursor-pointer"
              >
                Retry
              </button>
            )}
          </span>
        );
      default:
        return (
          <span className={`inline-flex items-center gap-1.5 text-xs ${baseText}`}>
            {mode === 'playground' ? 'Local workspace' : 'Ready'}
          </span>
        );
    }
  };

  const rubricCriteria = assessmentContext?.codingConfig?.rubricCriteria || [];
  const iframeSrc = `${frameSrcBase}?v=${encodeURIComponent(
    CODING_LAB_CONFIG.editorBridgeVersion
  )}&theme=${encodeURIComponent(labTheme)}&nonce=${encodeURIComponent(
    sessionNonceRef.current
  )}${effectiveReadOnly ? '&readonly=1' : ''}${reloadCounter > 0 ? `&r=${reloadCounter}` : ''}`;

  return (
    <div
      ref={hostRootRef}
      data-coding-lab-mode={labTheme}
      className={`relative flex flex-col w-full overflow-hidden ${
        fullViewport
          ? 'h-[100dvh] min-h-[100dvh] rounded-none border-0'
          : 'h-full min-h-[640px] border rounded-xl sm:rounded-2xl shadow-sm'
      } ${rootThemeClass}`}
    >
      {/* Lazy-Loaded Lightweight Ambient Shader ONLY in Glass Effect Mode (strictly behind chrome) */}
      {isGlass && (
        <Suspense fallback={null}>
          <CodingLabAmbientShader />
        </Suspense>
      )}

      {/* Hidden .sb3 file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".sb3"
        className="hidden"
        onChange={handleImportSb3File}
      />

      {/* TurboWarp-Style Top Menu Bar — Cleanly organized Settings ▾, File ▾, Project Title, and contextual actions */}
      <header
        ref={menuBarRef}
        className={`relative z-30 flex items-center justify-between gap-2 px-2.5 sm:px-3.5 h-12 border-b shrink-0 transition-colors ${headerThemeClass}`}
      >
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              title={exitLabel || 'Back'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-white/95 hover:bg-black/15 transition-colors shrink-0 cursor-pointer"
            >
              <ArrowLeft size={15} />
              <span className="hidden md:inline">{exitLabel || 'Back'}</span>
            </button>
          )}

          {/* Brand Emblem */}
          <div className="hidden sm:flex items-center gap-1.5 pl-1 pr-2 shrink-0 select-none">
            <Code2 size={17} className="text-white" />
            <span className="text-xs font-extrabold tracking-tight text-white">Coding Lab</span>
          </div>

          {/* Settings ▾ Dropdown (Theme Mode, Fullscreen, About & Licences) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'settings' ? null : 'settings'))}
              aria-expanded={openMenu === 'settings'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold text-white transition-colors cursor-pointer ${
                openMenu === 'settings' ? 'bg-black/25' : 'hover:bg-black/15'
              }`}
            >
              <Settings size={14} />
              <span>Settings</span>
              <ChevronDown size={13} className="opacity-85" />
            </button>

            {openMenu === 'settings' && (
              <div
                role="menu"
                className={`absolute left-0 top-full mt-1.5 w-60 rounded-xl border py-1.5 z-50 ${menuDropdownClass}`}
              >
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider opacity-60">
                  Appearance Theme
                </div>
                {(
                  [
                    { id: 'light', label: 'Light Mode', desc: 'Crisp studio workspace', icon: Sun },
                    { id: 'dark', label: 'Matte Black', desc: 'True matte dark studio', icon: Moon },
                    { id: 'glass', label: 'Glass Effect', desc: 'Crimson & frosted slate', icon: Sparkles },
                  ] as const
                ).map(({ id, label, desc, icon: Icon }) => {
                  const active = labTheme === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        handleSelectTheme(id);
                        setOpenMenu(null);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors cursor-pointer ${menuItemHoverClass}`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon size={14} className={active ? 'text-[#FF4C4C]' : 'opacity-70'} />
                        <span className="min-w-0">
                          <span className="block font-semibold">{label}</span>
                          <span className="block text-[10px] opacity-65">{desc}</span>
                        </span>
                      </span>
                      {active && <Check size={14} className="text-[#FF4C4C] shrink-0" />}
                    </button>
                  );
                })}

                <div
                  className={`my-1.5 border-t ${
                    isLight ? 'border-slate-200' : isDark ? 'border-[#2e2e2e]' : 'border-white/10'
                  }`}
                />

                {fullscreenUrl ? (
                  <a
                    href={fullscreenUrl}
                    role="menuitem"
                    onClick={() => setOpenMenu(null)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors ${menuItemHoverClass}`}
                  >
                    <Maximize2 size={14} className="opacity-75" />
                    <span>Open Full-Screen Workspace</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenu(null);
                      void toggleBrowserFullscreen();
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${menuItemHoverClass}`}
                  >
                    {isBrowserFullscreen ? (
                      <Minimize2 size={14} className="opacity-75" />
                    ) : (
                      <Maximize2 size={14} className="opacity-75" />
                    )}
                    <span>{isBrowserFullscreen ? 'Exit Browser Fullscreen' : 'Browser Fullscreen'}</span>
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenu(null);
                    setShowAboutModal(true);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${menuItemHoverClass}`}
                >
                  <Info size={14} className="opacity-75" />
                  <span>About &amp; Open-Source Licences</span>
                </button>
              </div>
            )}
          </div>

          {/* File ▾ Dropdown (New, Open/Import .sb3, Save/Download .sb3, Save Progress) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'file' ? null : 'file'))}
              aria-expanded={openMenu === 'file'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold text-white transition-colors cursor-pointer ${
                openMenu === 'file' ? 'bg-black/25' : 'hover:bg-black/15'
              }`}
            >
              <FileCode2 size={14} />
              <span>File</span>
              <ChevronDown size={13} className="opacity-85" />
            </button>

            {openMenu === 'file' && (
              <div
                role="menu"
                className={`absolute left-0 top-full mt-1.5 w-60 rounded-xl border py-1.5 z-50 ${menuDropdownClass}`}
              >
                {mode === 'playground' && !effectiveReadOnly && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenu(null);
                      void handleResetNewProject();
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${menuItemHoverClass}`}
                  >
                    <FilePlus2 size={14} className="opacity-75" />
                    <span>New Project</span>
                  </button>
                )}

                {!effectiveReadOnly &&
                  (mode === 'playground' ||
                    assessmentContext?.codingConfig?.allowSb3Import !== false) && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenu(null);
                        fileInputRef.current?.click();
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${menuItemHoverClass}`}
                    >
                      <FolderOpen size={14} className="opacity-75" />
                      <span>Load from your computer (.sb3)</span>
                    </button>
                  )}

                <button
                  type="button"
                  role="menuitem"
                  disabled={!editorReady}
                  onClick={() => {
                    setOpenMenu(null);
                    void handleDownloadSb3();
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer ${menuItemHoverClass}`}
                >
                  <Download size={14} className="opacity-75" />
                  <span>Save to your computer (.sb3)</span>
                </button>

                {mode === 'assessment' && !effectiveReadOnly && (
                  <>
                    <div
                      className={`my-1.5 border-t ${
                        isLight ? 'border-slate-200' : isDark ? 'border-[#2e2e2e]' : 'border-white/10'
                      }`}
                    />
                    <button
                      type="button"
                      role="menuitem"
                      disabled={
                        !editorReady ||
                        saveState === 'saving_lms' ||
                        saveState === 'uploading_assets'
                      }
                      onClick={() => {
                        setOpenMenu(null);
                        void saveToLmsCloud(true);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer ${menuItemHoverClass}`}
                    >
                      <Save size={14} className="text-[#FF4C4C]" />
                      <span>Save Progress to LMS</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Edit ▾ Dropdown (TurboWarp-style Turbo Mode, Pause/Resume, Find Ctrl+F) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'edit' ? null : 'edit'))}
              aria-expanded={openMenu === 'edit'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold text-white transition-colors cursor-pointer ${
                openMenu === 'edit' ? 'bg-black/25' : 'hover:bg-black/15'
              }`}
            >
              <Pencil size={13} />
              <span>Edit</span>
              <ChevronDown size={13} className="opacity-85" />
            </button>

            {openMenu === 'edit' && (
              <div
                role="menu"
                className={`absolute left-0 top-full mt-1.5 w-60 rounded-xl border py-1.5 z-50 ${menuDropdownClass}`}
              >
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={turboSettings.turboMode}
                  onClick={() => {
                    pushTurboSettings({
                      ...turboSettings,
                      turboMode: !turboSettings.turboMode,
                    });
                    setOpenMenu(null);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${menuItemHoverClass}`}
                >
                  <span className="flex items-center gap-2.5">
                    <Zap
                      size={14}
                      className={turboSettings.turboMode ? 'text-amber-500' : 'opacity-75'}
                    />
                    <span>
                      {turboSettings.turboMode ? 'Turn off Turbo Mode' : 'Turn on Turbo Mode'}
                    </span>
                  </span>
                  {turboSettings.turboMode && <Check size={14} className="text-[#FF4C4C]" />}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleToggleStagePause();
                    setOpenMenu(null);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${menuItemHoverClass}`}
                >
                  {stagePaused ? (
                    <Play size={14} className="text-amber-500" />
                  ) : (
                    <Pause size={14} className="opacity-75" />
                  )}
                  <span>{stagePaused ? 'Resume Stage' : 'Pause Stage'}</span>
                </button>

                <div
                  className={`my-1.5 border-t ${
                    isLight ? 'border-slate-200' : isDark ? 'border-[#2e2e2e]' : 'border-white/10'
                  }`}
                />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenu(null);
                    handleFocusFindBar();
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${menuItemHoverClass}`}
                >
                  <Search size={14} className="opacity-75" />
                  <span>Find Blocks (Ctrl+F)</span>
                </button>
              </div>
            )}
          </div>

          {/* Advanced Button (TurboWarp-style Advanced Runtime Settings) */}
          <button
            type="button"
            onClick={() => {
              setOpenMenu(null);
              setShowAdvancedModal(true);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold text-white transition-colors cursor-pointer ${
              showAdvancedModal ||
              turboSettings.fps60 ||
              turboSettings.removeFencing ||
              turboSettings.infiniteClones ||
              turboSettings.removeLimits
                ? 'bg-black/25'
                : 'hover:bg-black/15'
            }`}
          >
            <SlidersHorizontal size={13} />
            <span className="hidden sm:inline">Advanced</span>
          </button>

          {/* Translucent Project Title Field (TurboWarp-style) */}
          <div className="ml-1 sm:ml-2 min-w-0">
            {mode === 'playground' && !effectiveReadOnly ? (
              <input
                type="text"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                maxLength={120}
                aria-label="Project title"
                placeholder="Project"
                className="h-8 px-2.5 rounded-md bg-white/20 hover:bg-white/25 focus:bg-white/30 border border-white/25 focus:border-white/60 text-xs font-semibold text-white placeholder:text-white/70 focus:outline-none w-36 sm:w-52 transition-colors truncate"
              />
            ) : (
              <div
                title={projectTitle}
                className="h-8 px-2.5 rounded-md bg-black/15 border border-white/15 flex items-center text-xs font-semibold text-white truncate max-w-[150px] sm:max-w-[260px]"
              >
                {projectTitle}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Save Status + Assessment Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden lg:flex items-center px-1">{renderSaveStatus(true)}</div>

          {mode === 'assessment' && remainingSeconds !== null && !effectiveReadOnly && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold tabular-nums border ${
                remainingSeconds < 300
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-black/25 text-white border-white/25'
              }`}
            >
              <Clock size={13} />
              {formatTimer(remainingSeconds)}
            </span>
          )}

          {mode === 'assessment' && (
            <>
              <button
                type="button"
                onClick={() => setShowInstructionsPanel((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  showInstructionsPanel
                    ? 'bg-white text-[#b91c1c]'
                    : 'bg-black/15 hover:bg-black/25 text-white border border-white/20'
                }`}
              >
                <BookOpen size={14} />
                <span className="hidden sm:inline">Task Brief</span>
                {showInstructionsPanel ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {!effectiveReadOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => void saveToLmsCloud(true)}
                    disabled={
                      !editorReady ||
                      saveState === 'saving_lms' ||
                      saveState === 'uploading_assets'
                    }
                    className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/15 hover:bg-black/25 border border-white/25 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Save size={13} />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSubmitConfirm(true)}
                    disabled={!editorReady || submitting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-red-50 text-[#b91c1c] text-xs font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Send size={13} />
                    <span>Submit</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </header>

      {/* Mobile Save Status Bar */}
      <div
        className={`relative z-10 flex lg:hidden items-center justify-between px-4 py-1.5 border-b shrink-0 ${subtleBarClass}`}
      >
        {renderSaveStatus(false)}
        {mode === 'assessment' && assessmentContext?.maxScore ? (
          <span className="text-[11px] font-semibold">
            Max Marks: {assessmentContext.maxScore}
          </span>
        ) : null}
      </div>

      {/* Recovery / Error Notifications */}
      {recoveryBanner && (
        <div
          className={`relative z-10 flex items-center justify-between gap-2 px-4 py-2 border-b text-xs shrink-0 ${
            isLight
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-amber-950/60 backdrop-blur-md border-amber-500/30 text-amber-200'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <RotateCcw size={13} className="shrink-0" />
            {recoveryBanner}
          </span>
          <button
            type="button"
            onClick={() => setRecoveryBanner('')}
            className="text-[11px] font-semibold underline shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorBanner && (
        <div
          className={`relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b text-xs shrink-0 ${
            isLight
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-red-950/70 backdrop-blur-md border-red-500/40 text-red-200'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            {errorBanner}
          </span>
          <div className="flex items-center gap-3 shrink-0">
            {mode === 'assessment' && !effectiveReadOnly && (
              <button
                type="button"
                onClick={() =>
                  autoExpireTriggeredRef.current
                    ? void executeCodingLabSubmit(true)
                    : void saveToLmsCloud(false)
                }
                className="text-[11px] font-bold underline cursor-pointer"
              >
                {autoExpireTriggeredRef.current ? 'Retry Submission' : 'Retry Save'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleDownloadSb3()}
              className="text-[11px] font-semibold underline cursor-pointer"
            >
              Download .sb3 Backup
            </button>
            <button
              type="button"
              onClick={() => setErrorBanner('')}
              className="text-[11px] font-semibold underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Assessment Instructions & Criteria Panel */}
      {mode === 'assessment' && showInstructionsPanel && assessmentContext && (
        <section
          className={`relative z-10 px-4 py-3 border-b max-h-56 overflow-y-auto shrink-0 transition-colors ${briefPanelClass}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {assessmentContext.subject && (
                <span className="font-semibold">{assessmentContext.subject}</span>
              )}
              {assessmentContext.maxScore ? (
                <span>
                  Maximum Marks: <strong>{assessmentContext.maxScore}</strong>
                </span>
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
            <p className="text-xs sm:text-sm whitespace-pre-line mb-2.5 opacity-90">
              {assessmentContext.instructions}
            </p>
          )}

          {rubricCriteria.length > 0 && (
            <div
              className={`pt-2 border-t ${
                isLight ? 'border-slate-100' : 'border-white/10'
              }`}
            >
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-65 mb-1.5">
                Task Checklist ({rubricCriteria.length} criteria)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {rubricCriteria.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                      isLight
                        ? 'bg-slate-50 text-slate-700'
                        : 'bg-white/5 border border-white/10 text-slate-100'
                    }`}
                  >
                    <span className="truncate">{c.label}</span>
                    <span className="font-semibold opacity-75 shrink-0 tabular-nums">
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
      <div
        className={`relative z-10 flex xl:hidden items-center justify-between gap-2 px-3 py-1 border-b text-[11px] shrink-0 ${subtleBarClass}`}
      >
        <span>
          Tip: Scroll left/right and up/down inside the workspace to reach Blocks, Stage, Sprites &amp; Backdrops.
        </span>
      </div>

      {/* Main Self-Hosted Visual Programming Workspace (Opaque & Color-Accurate — NEVER filtered or blurred) */}
      <div
        className={`relative z-10 flex-1 w-full min-h-0 overflow-auto ${
          isLight ? 'bg-[#e8edf5]' : isDark ? 'bg-[#111111]' : 'bg-[#0b1120]'
        }`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {(!editorReady || hydrating) && (
          <div
            className={`absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center gap-3 ${
              isLight
                ? 'bg-slate-50/95 text-slate-700'
                : isDark
                ? 'bg-[#111111]/95 text-[#eeeeee]'
                : 'bg-[#0B1120]/95 text-slate-100'
            }`}
          >
            {handshakeTimedOut && !editorReady ? (
              <div className="max-w-sm space-y-3">
                <div className="mx-auto w-11 h-11 rounded-xl bg-red-600/15 text-red-500 flex items-center justify-center">
                  <AlertCircle size={22} />
                </div>
                <div className="text-sm font-bold">
                  Coding Lab Editor Took Too Long to Start
                </div>
                <p className="text-xs opacity-75 leading-relaxed">
                  The self-hosted visual programming engine did not finish initializing within{' '}
                  {Math.round(CODING_LAB_CONFIG.handshakeTimeoutMs / 1000)} seconds. Your local
                  project work remains protected on this device.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleRetryEditorLoad}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold cursor-pointer"
                  >
                    <RefreshCw size={13} />
                    Retry Loading Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadSb3()}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${secondaryBtnClass}`}
                  >
                    <Download size={13} />
                    Download Local Backup (.sb3)
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Loader2 size={28} className="animate-spin text-[#B91C1C]" />
                <div className="text-sm font-semibold">Loading Coding Lab Editor...</div>
                <div className="text-xs opacity-70">
                  Initializing self-hosted visual programming engine
                </div>
              </>
            )}
          </div>
        )}

        <iframe
          key={`${frameSrcBase}-${reloadCounter}`}
          ref={iframeRef}
          src={iframeSrc}
          title="Coding Lab Visual Programming Workspace"
          className="w-full h-full min-w-[1024px] xl:min-w-full min-h-[600px] border-0 block"
          sandbox="allow-scripts allow-same-origin allow-downloads"
          onLoad={() => {
            const win = iframeRef.current?.contentWindow;
            if (!win) return;
            win.postMessage(
              { type: 'CODING_LAB_HANDSHAKE_INIT', nonce: sessionNonceRef.current },
              window.location.origin
            );
            win.postMessage(
              { type: 'CODING_LAB_SET_THEME', nonce: sessionNonceRef.current, theme: labTheme },
              window.location.origin
            );
            win.postMessage(
              { type: 'CODING_LAB_PING', nonce: sessionNonceRef.current },
              window.location.origin
            );
          }}
        />
      </div>

      {/* Submit Assessment Confirmation Dialog */}
      {showSubmitConfirm && mode === 'assessment' && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-4 ${
              isLight
                ? 'bg-white border-slate-200 text-slate-900'
                : isGlass
                ? 'bg-slate-900/90 backdrop-blur-md border-slate-200/20 text-slate-50'
                : 'bg-[#1a1a1a] border-[#333333] text-[#eeeeee]'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600/15 text-[#DC2626] flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold">Submit Coding Assessment?</h3>
                <p className="text-xs opacity-80 mt-1 leading-relaxed">
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
                className={`px-4 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${secondaryBtnClass}`}
              >
                Continue Editing
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void executeCodingLabSubmit(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold disabled:opacity-60 cursor-pointer"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {submitting ? 'Saving & Submitting...' : 'Confirm Submission'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TurboWarp-Style Advanced Runtime Settings Modal */}
      {showAdvancedModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Advanced Coding Lab Settings"
          onClick={() => setShowAdvancedModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
              isLight
                ? 'bg-white border-slate-200 text-slate-900'
                : isGlass
                ? 'bg-slate-900/95 backdrop-blur-md border-slate-200/20 text-slate-50'
                : 'bg-[#1a1a1a] border-[#333333] text-[#eeeeee]'
            }`}
          >
            <div
              className={`flex items-center justify-between px-5 py-3.5 border-b ${
                isLight
                  ? 'bg-[#FF4C4C] text-white border-[#e03e3e]'
                  : isDark
                  ? 'bg-[#222222] text-white border-[#333333]'
                  : 'bg-[#7f1d1d]/80 text-white border-white/15'
              }`}
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} />
                <h3 className="text-sm font-bold">Advanced Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvancedModal(false)}
                aria-label="Close Advanced Settings"
                className="p-1 rounded-md hover:bg-black/20 text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {(
                [
                  {
                    key: 'turboMode',
                    title: 'Turbo Mode',
                    desc: 'Runs blocks as fast as possible without waiting for screen refreshes.',
                  },
                  {
                    key: 'fps60',
                    title: '60 FPS (Custom Framerate)',
                    desc: 'Runs stage animation at 60 frames per second instead of 30 FPS.',
                  },
                  {
                    key: 'removeFencing',
                    title: 'Remove Fencing',
                    desc: 'Allows sprites to move completely off-screen and grow to any size.',
                  },
                  {
                    key: 'infiniteClones',
                    title: 'Infinite Clones',
                    desc: 'Removes the standard 300-clone limit for advanced simulations.',
                  },
                  {
                    key: 'removeLimits',
                    title: 'Remove Miscellaneous Limits',
                    desc: 'Removes extra sound effect, pen size, and clamping restrictions.',
                  },
                ] as const
              ).map(({ key, title, desc }) => {
                const checked = turboSettings[key];
                return (
                  <label
                    key={key}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      isLight
                        ? 'border-slate-200 hover:bg-slate-50'
                        : isDark
                        ? 'border-[#2e2e2e] bg-[#222222]/60 hover:bg-[#282828]'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        pushTurboSettings({
                          ...turboSettings,
                          [key]: e.target.checked,
                        })
                      }
                      className="mt-0.5 h-4 w-4 rounded accent-[#FF4C4C] cursor-pointer"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold">{title}</span>
                      <span className="block text-[11px] opacity-70 mt-0.5 leading-relaxed">
                        {desc}
                      </span>
                    </span>
                  </label>
                );
              })}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() =>
                    pushTurboSettings({
                      turboMode: false,
                      fps60: false,
                      removeFencing: false,
                      infiniteClones: false,
                      removeLimits: false,
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${secondaryBtnClass}`}
                >
                  Reset Defaults
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdvancedModal(false)}
                  className="px-4 py-1.5 rounded-lg bg-[#FF4C4C] hover:bg-[#dc2626] text-white text-xs font-bold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CodingLabComplianceModal open={showAboutModal} onClose={() => setShowAboutModal(false)} />
    </div>
  );
};

export default CodingLabEditorHost;
