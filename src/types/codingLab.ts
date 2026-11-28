export type CodingLabMode = 'playground' | 'assessment';

export type CodingLabGradingMethod = 'automatic' | 'manual' | 'hybrid';

export type CodingLabEngine = 'scratch' | 'turbowarp';

export type CodingLabThemeMode = 'light' | 'dark' | 'glass';

export type CodingLabSaveState =
  | 'idle'
  | 'dirty'
  | 'saving_local'
  | 'saved_local'
  | 'uploading_assets'
  | 'saving_lms'
  | 'saved_lms'
  | 'offline_pending'
  | 'submitted_locked'
  | 'error';

export type CodingLabCriterionType =
  | 'EVENT_BLOCK_USED'
  | 'BLOCK_PRESENT'
  | 'BLOCK_INPUT_VALUE'
  | 'BLOCK_FIELD_VALUE'
  | 'BLOCK_SEQUENCE'
  | 'BLOCK_NESTED'
  | 'VARIABLE_OR_LIST_USED'
  | 'SPRITE_COUNT'
  | 'COSTUME_OR_BACKDROP_CHECK';

export interface CodingLabRubricCriterion {
  id: string;
  label: string;
  description?: string;
  type: CodingLabCriterionType;
  marks: number;
  // Type-specific parameters
  opcode?: string;
  minCount?: number;
  targetScope?: 'any' | 'sprite' | 'stage';
  requireAttachedScript?: boolean;
  inputName?: string;
  expectedValue?: string;
  comparison?: 'equals' | 'numeric_equals' | 'gte' | 'lte' | 'contains';
  fieldName?: string;
  opcodes?: string[];
  strictAdjacent?: boolean;
  outerOpcode?: string;
  innerOpcode?: string;
  outerInputName?: string;
  outerExpectedValue?: string;
  variableKind?: 'variable' | 'list' | 'either';
  variableName?: string;
  requireReferencedInBlocks?: boolean;
  minSprites?: number;
  maxSprites?: number;
  assetTargetKind?: 'sprite' | 'stage';
}

export interface CodingLabCriterionResult {
  criterionId: string;
  label: string;
  type: CodingLabCriterionType;
  passed: boolean;
  awardedMarks: number;
  maxMarks: number;
  feedback: string;
}

export interface CodingLabAutoGradeResult {
  automaticScore: number;
  maxAutomaticScore: number;
  percentage: number;
  criterionResults: CodingLabCriterionResult[];
  summaryMetrics: {
    spriteCount: number;
    totalBlocks: number;
    topLevelScripts: number;
    variableCount: number;
    listCount: number;
    costumeCount: number;
    soundCount: number;
    opcodesUsed: string[];
  };
  gradedAt: string;
}

export interface CodingLabAssetManifestEntry {
  scratchAssetId: string;
  md5ext: string;
  dataFormat: string;
  assetCategory: 'builtin_image' | 'builtin_sound' | 'custom_image';
  contentHash?: string;
  cloudinaryPublicId?: string;
  cloudinaryResourceType?: 'image' | 'raw';
  cloudinaryDeliveryType?: 'authenticated' | 'upload';
  cloudinaryVersion?: number;
  deliveryUrl?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
}

export interface CodingLabStarterProjectConfig {
  projectId?: string;
  title: string;
  fileName?: string;
  payloadHash: string;
  payloadSize: number;
  payloadCompression: 'gzip' | 'none';
  inlinePayloadBase64?: string;
  chunkCount?: number;
  assetManifest: CodingLabAssetManifestEntry[];
  uploadedAt: string;
}

export interface CodingLabAssessmentConfig {
  programmingEnvironment: 'scratch-3-visual';
  gradingMethod: CodingLabGradingMethod;
  rubricCriteria: CodingLabRubricCriterion[];
  manualRubricMaxMarks?: number;
  passMark?: number;
  starterProject?: CodingLabStarterProjectConfig | null;
  allowSb3Import?: boolean;
  disableCustomAudio: true;
  disableMicrophoneRecording: true;
}

export interface CodingLabProjectRecord {
  id: string;
  ownerUid: string;
  assessmentId: string;
  attemptId: string;
  schoolId?: string;
  title: string;
  revision: number;
  payloadFormat: 'scratch-sb3-json-v3';
  payloadCompression: 'gzip' | 'none';
  payloadStorageMode: 'inline' | 'chunked';
  payloadHash: string;
  compositeHash?: string;
  chunkHashes?: string[];
  payloadSize: number;
  chunkCount: number;
  assetManifest: CodingLabAssetManifestEntry[];
  status: 'draft' | 'submitted';
  createdAt?: unknown;
  updatedAt?: unknown;
  submittedAt?: unknown;
}

export interface CodingLabGradeOverrideEntry {
  actorUid: string;
  actorName: string;
  actorRole: string;
  previousScore: number | null;
  newScore: number;
  reason: string;
  timestamp: string;
}

export interface CodingLabSubmissionRecord {
  id: string;
  projectId: string;
  assessmentId: string;
  learnerUid: string;
  learnerName?: string;
  schoolId?: string;
  attemptId: string;
  attemptNumber?: number;
  projectRevision: number;
  submittedAt: string;
  submissionHash: string;
  gradingMethod: CodingLabGradingMethod;
  gradingStatus: 'auto_graded' | 'pending_manual_review' | 'graded';
  automaticScore: number | null;
  maxAutomaticScore?: number;
  manualScore: number | null;
  finalScore: number | null;
  maxScore: number;
  percentage?: number | null;
  criterionResults?: CodingLabCriterionResult[];
  summaryMetrics?: CodingLabAutoGradeResult['summaryMetrics'];
  tutorFeedback?: string;
  gradeOverrides?: CodingLabGradeOverrideEntry[];
  resultReleased?: boolean;
  releasedAt?: string | null;
  assetManifest?: CodingLabAssetManifestEntry[];
}
