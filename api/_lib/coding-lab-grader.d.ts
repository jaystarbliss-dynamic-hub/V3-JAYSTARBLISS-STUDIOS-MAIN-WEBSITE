import type {
  CodingLabAutoGradeResult,
  CodingLabCriterionResult,
  CodingLabRubricCriterion,
} from '../../src/types/codingLab';

export const CODING_LAB_CRITERION_TYPES: string[];

export function extractScratchInputValue(
  inputEntry: unknown,
  blocksMap?: Record<string, any>
): string | null;

export function analyzeScratchProject(
  projectJson: Record<string, any> | null | undefined
): CodingLabAutoGradeResult['summaryMetrics'];

export function evaluateRubricCriterion(
  projectJson: Record<string, any> | null | undefined,
  criterion: CodingLabRubricCriterion
): CodingLabCriterionResult;

export function gradeScratchProject(
  projectJson: Record<string, any> | null | undefined,
  rubricCriteria?: CodingLabRubricCriterion[]
): CodingLabAutoGradeResult;
