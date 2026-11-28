/**
 * Central configuration, engine switch, and security/resource guardrails for
 * Jaystarbliss Dynamic Institute Coding Lab.
 * Protects shared Firebase Spark plan and Cloudinary allowances with configurable limits.
 */

export type CodingLabEngine = 'scratch' | 'turbowarp';
export type CodingLabThemeMode = 'light' | 'dark' | 'glass';

const rawEngine = String(import.meta.env.VITE_CODING_LAB_ENGINE || 'scratch')
  .trim()
  .toLowerCase();

export const CODING_LAB_ENGINE: CodingLabEngine =
  rawEngine === 'turbowarp' ? 'turbowarp' : 'scratch';

const ENGINE_REGISTRY: Record<
  CodingLabEngine,
  {
    id: CodingLabEngine;
    label: string;
    frameUrl: string;
    staticAssetsBaseUrl: string;
    licenseSummary: string;
    upstreamRepositoryUrl: string;
  }
> = {
  scratch: {
    id: 'scratch',
    label: 'Coding Lab Studio (Scratch 3 Core)',
    frameUrl: '/coding-lab-editor/index.html',
    staticAssetsBaseUrl: '/coding-lab-editor/static/assets',
    licenseSummary: 'GNU Affero General Public License v3.0 (AGPL-3.0-only)',
    upstreamRepositoryUrl: 'https://github.com/scratchfoundation/scratch-editor',
  },
  turbowarp: {
    id: 'turbowarp',
    label: 'Coding Lab Studio (TurboWarp Core)',
    // Self-hosted same-origin bundle path only — NEVER embeds hosted turbowarp.org
    frameUrl: '/coding-lab-turbowarp/index.html',
    staticAssetsBaseUrl: '/coding-lab-editor/static/assets',
    licenseSummary: 'GNU General Public License v3.0 (GPL-3.0) + BSD-3-Clause',
    upstreamRepositoryUrl: 'https://github.com/TurboWarp/scratch-gui',
  },
};

const activeEngineMeta = ENGINE_REGISTRY[CODING_LAB_ENGINE];

export const CODING_LAB_CONFIG = {
  /** Central feature flag — disables Coding Lab UI entry points without affecting NATIVE or EXTERNAL_LINK exams. */
  enabled: import.meta.env.VITE_CODING_LAB_ENABLED !== 'false',

  /** Controlled dual-engine configuration (same-origin self-hosted bundles only). */
  engine: CODING_LAB_ENGINE,
  engineRegistry: ENGINE_REGISTRY,
  editorFrameUrl: activeEngineMeta.frameUrl,
  editorFrameFallbackUrl: ENGINE_REGISTRY.scratch.frameUrl,
  staticAssetsBaseUrl: activeEngineMeta.staticAssetsBaseUrl,
  editorBridgeVersion: '20261127-4',
  handshakeTimeoutMs: 18_000,

  /** Appearance theme preferences (stored strictly in localStorage, isolated from portal theme). */
  defaultTheme: 'light' as CodingLabThemeMode,
  themeStorageKey: 'jdi_coding_lab_theme_v1',

  /** Controlled autosave timings (milliseconds). */
  localRecoveryDebounceMs: 1500,
  cloudAutosaveDebounceMs: 25_000, // 25s of inactivity before writing to Firestore

  /** Firestore 1 MiB document safety thresholds (550 KiB compressed payload leaves safe metadata headroom). */
  firestoreSingleDocPayloadThresholdBytes: 550 * 1024,
  firestoreChunkSizeBytes: 350 * 1024, // 350 KiB per chunk in payloadChunks subcollection

  /** Local IndexedDB recovery hygiene limits. */
  maxLocalDraftAgeMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  maxLocalDraftTotalBytes: 40 * 1024 * 1024, // 40 MiB total across drafts
  maxLocalDraftCount: 16,

  /** Cloudinary shared-account resource protection limits (Assessment mode only). */
  cloudinaryFolder: 'coding-lab/assets',
  maxCustomImageBytes: 1024 * 1024, // 1 MiB per custom image
  maxCustomImagesPerProject: 20,
  maxAggregateCustomImageBytes: 10 * 1024 * 1024, // 10 MiB aggregate custom images per assessment project
  allowedCustomImageFormats: ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'] as const,
  assetUploadConcurrency: 3,

  /**
   * Explicit local-dev/emulator-only fallback flags.
   * Production builds NEVER fall back to unsigned Cloudinary uploads or client-side assessment submission.
   */
  allowDevUnsignedCloudinaryFallback:
    Boolean(import.meta.env.DEV) &&
    String(import.meta.env.VITE_CODING_LAB_ALLOW_DEV_UNSIGNED_UPLOAD || '').toLowerCase() === 'true',
  allowDevClientSubmissionFallback:
    Boolean(import.meta.env.DEV) &&
    String(import.meta.env.VITE_CODING_LAB_ALLOW_DEV_CLIENT_SUBMISSION || '').toLowerCase() === 'true',

  /** .sb3 import validation & security limits. */
  maxSb3CompressedBytes: 25 * 1024 * 1024, // 25 MiB
  maxSb3UncompressedBytes: 50 * 1024 * 1024, // 50 MiB
  maxSb3FileCount: 250,
  maxProjectJsonBytes: 5 * 1024 * 1024, // 5 MiB

  /** Sound & recording policy (v1 strict restriction). */
  allowMicrophoneRecording: false,
  allowCustomAudioUploads: false,

  /** Open-Source Licensing & Trademark Compliance Metadata. */
  compliance: {
    featureName: 'Coding Lab',
    activeEngine: CODING_LAB_ENGINE,
    upstreamRepositoryUrl: activeEngineMeta.upstreamRepositoryUrl,
    upstreamVersion: '15.3.0',
    upstreamCommitHash: '89181a7a224793a05bf9d55e2aecc68417534076',
    licenseName: activeEngineMeta.licenseSummary,
    licenseTextUrl: '/coding-lab-editor/LICENSE',
    modificationsRecordUrl: '/coding-lab-editor/MODIFICATIONS.md',
    mediaLicensesUrl: '/coding-lab-editor/MEDIA_LICENSES.md',
    /**
     * Set VITE_CODING_LAB_SOURCE_REPO_URL once the corresponding modified editor source
     * repository is publicly hosted for network users per AGPL-3.0 Section 13 / GPL-3.0.
     * Never publish a fake or placeholder URL.
     */
    modifiedSourceDistributionUrl:
      typeof import.meta.env.VITE_CODING_LAB_SOURCE_REPO_URL === 'string' &&
      import.meta.env.VITE_CODING_LAB_SOURCE_REPO_URL.trim().startsWith('https://')
        ? import.meta.env.VITE_CODING_LAB_SOURCE_REPO_URL.trim()
        : null,
    independentProductNotice:
      'This is an independent coding environment based on open-source Scratch technology. It is not an official Scratch or TurboWarp product and is not affiliated with or endorsed by the Scratch Foundation or TurboWarp.',
    requiredScratchAttribution:
      'Scratch is developed by the Scratch Foundation and its partners and affiliates. See https://scratch.org/.',
  },
} as const;
