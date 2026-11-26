/**
 * Central configuration and feature flag for Jaystarbliss Dynamic Institute Coding Lab.
 * Protects shared Firebase Spark plan and Cloudinary allowances with configurable limits.
 */

export const CODING_LAB_CONFIG = {
  /** Central feature flag — disables Coding Lab UI entry points without affecting NATIVE or EXTERNAL_LINK exams. */
  enabled: import.meta.env.VITE_CODING_LAB_ENABLED !== 'false',

  /** Editor self-hosted same-origin path (served from public/coding-lab-editor/index.html). */
  editorFrameUrl: '/coding-lab-editor/index.html',
  staticAssetsBaseUrl: '/coding-lab-editor/static/assets',

  /** Controlled autosave timings (milliseconds). */
  localRecoveryDebounceMs: 1500,
  cloudAutosaveDebounceMs: 25_000, // 25s of inactivity before writing to Firestore

  /** Firestore 1 MiB document safety thresholds. */
  firestoreSingleDocPayloadThresholdBytes: 700 * 1024, // 700 KiB compressed payload
  firestoreChunkSizeBytes: 350 * 1024, // 350 KiB per chunk in payloadChunks subcollection

  /** Cloudinary shared-account resource protection limits (Assessment mode only). */
  cloudinaryFolder: 'coding-lab/assets',
  maxCustomImageBytes: 1024 * 1024, // 1 MiB per custom image
  maxCustomImagesPerProject: 20,
  maxAggregateCustomImageBytes: 10 * 1024 * 1024, // 10 MiB aggregate custom images per assessment project
  allowedCustomImageFormats: ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'] as const,

  /** .sb3 import validation & security limits. */
  maxSb3CompressedBytes: 25 * 1024 * 1024, // 25 MiB
  maxSb3UncompressedBytes: 50 * 1024 * 1024, // 50 MiB
  maxSb3FileCount: 250,
  maxProjectJsonBytes: 5 * 1024 * 1024, // 5 MiB

  /** Sound & recording policy (v1 strict restriction). */
  allowMicrophoneRecording: false,
  allowCustomAudioUploads: false,

  /** AGPL-3.0 & Scratch Trademark Compliance Metadata. */
  compliance: {
    featureName: 'Coding Lab',
    upstreamRepositoryUrl: 'https://github.com/scratchfoundation/scratch-editor',
    upstreamVersion: '15.3.0',
    upstreamCommitHash: '89181a7a224793a05bf9d55e2aecc68417534076',
    licenseName: 'GNU Affero General Public License v3.0 (AGPL-3.0-only)',
    licenseTextUrl: '/coding-lab-editor/LICENSE',
    modificationsRecordUrl: '/coding-lab-editor/MODIFICATIONS.md',
    mediaLicensesUrl: '/coding-lab-editor/MEDIA_LICENSES.md',
    /**
     * Set VITE_CODING_LAB_SOURCE_REPO_URL once the corresponding modified editor source
     * repository is publicly hosted for network users per AGPL-3.0 Section 13.
     * Never publish a fake or placeholder URL.
     */
    modifiedSourceDistributionUrl:
      typeof import.meta.env.VITE_CODING_LAB_SOURCE_REPO_URL === 'string' &&
      import.meta.env.VITE_CODING_LAB_SOURCE_REPO_URL.trim().startsWith('https://')
        ? import.meta.env.VITE_CODING_LAB_SOURCE_REPO_URL.trim()
        : null,
    independentProductNotice:
      'This is an independent coding environment based on the open-source Scratch editor. It is not an official Scratch product and is not affiliated with or endorsed by the Scratch Foundation.',
    requiredScratchAttribution:
      'Scratch is developed by the Scratch Foundation and its partners and affiliates. See https://scratch.org/.',
  },
} as const;
