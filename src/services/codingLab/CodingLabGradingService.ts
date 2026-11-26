/**
 * CodingLabGradingService — client wrapper around the shared Scratch 3
 * structural grading engine plus tutor rubric criterion presets.
 */

import {
  analyzeScratchProject,
  evaluateRubricCriterion,
  gradeScratchProject,
} from '../../../api/_lib/coding-lab-grader.js';
import type {
  CodingLabAutoGradeResult,
  CodingLabRubricCriterion,
} from '../../types/codingLab';

export { analyzeScratchProject, evaluateRubricCriterion, gradeScratchProject };

export interface CodingLabRubricPreset {
  id: string;
  name: string;
  summary: string;
  criterion: Omit<CodingLabRubricCriterion, 'id'>;
}

export const CODING_LAB_RUBRIC_PRESETS: CodingLabRubricPreset[] = [
  {
    id: 'preset_green_flag',
    name: 'Green Flag Start Event',
    summary: 'Uses a "when green flag clicked" block attached to a script',
    criterion: {
      label: 'Starts with Green Flag event block',
      type: 'EVENT_BLOCK_USED',
      opcode: 'event_whenflagclicked',
      requireAttachedScript: true,
      marks: 2,
    },
  },
  {
    id: 'preset_move_50',
    name: 'Move 50 Steps',
    summary: 'Uses a "move (50) steps" motion block',
    criterion: {
      label: 'Moves character 50 steps',
      type: 'BLOCK_INPUT_VALUE',
      opcode: 'motion_movesteps',
      inputName: 'STEPS',
      expectedValue: '50',
      comparison: 'numeric_equals',
      marks: 2,
    },
  },
  {
    id: 'preset_turn_90',
    name: 'Turn 90 Degrees',
    summary: 'Uses a "turn right (90) degrees" block',
    criterion: {
      label: 'Turns character 90 degrees',
      type: 'BLOCK_INPUT_VALUE',
      opcode: 'motion_turnright',
      inputName: 'DEGREES',
      expectedValue: '90',
      comparison: 'numeric_equals',
      marks: 2,
    },
  },
  {
    id: 'preset_repeat_4_move',
    name: 'Repeat Loop (4x) with Movement',
    summary: 'Places a move block inside a repeat (4) loop',
    criterion: {
      label: 'Uses repeat (4) loop containing movement block',
      type: 'BLOCK_NESTED',
      outerOpcode: 'control_repeat',
      outerInputName: 'TIMES',
      outerExpectedValue: '4',
      innerOpcode: 'motion_movesteps',
      marks: 2,
    },
  },
  {
    id: 'preset_sequence_flag_move',
    name: 'Event -> Move Sequence',
    summary: 'Connects Green Flag -> Move Steps in execution order',
    criterion: {
      label: 'Connects Green Flag to movement in sequence',
      type: 'BLOCK_SEQUENCE',
      opcodes: ['event_whenflagclicked', 'motion_movesteps'],
      strictAdjacent: false,
      marks: 2,
    },
  },
  {
    id: 'preset_variable_used',
    name: 'Uses a Variable',
    summary: 'Creates and references a variable inside blocks',
    criterion: {
      label: 'Declares and uses a variable in blocks',
      type: 'VARIABLE_OR_LIST_USED',
      variableKind: 'variable',
      variableName: '',
      requireReferencedInBlocks: true,
      marks: 2,
    },
  },
  {
    id: 'preset_conditional_if',
    name: 'Conditional (If) Logic',
    summary: 'Uses at least one if-then conditional block',
    criterion: {
      label: 'Implements conditional if-then logic',
      type: 'BLOCK_PRESENT',
      opcode: 'control_if',
      minCount: 1,
      marks: 2,
    },
  },
  {
    id: 'preset_multiple_sprites',
    name: 'Multiple Sprites (2+)',
    summary: 'Project contains at least 2 interactive sprites',
    criterion: {
      label: 'Includes at least 2 sprites',
      type: 'SPRITE_COUNT',
      minSprites: 2,
      marks: 2,
    },
  },
];

export const COMMON_SCRATCH_OPCODES: Array<{ opcode: string; label: string; category: string }> = [
  { opcode: 'event_whenflagclicked', label: 'when green flag clicked', category: 'Events' },
  { opcode: 'event_whenkeypressed', label: 'when [key] pressed', category: 'Events' },
  { opcode: 'event_whenthisspriteclicked', label: 'when this sprite clicked', category: 'Events' },
  { opcode: 'event_broadcast', label: 'broadcast [message]', category: 'Events' },
  { opcode: 'event_whenbroadcastreceived', label: 'when I receive [message]', category: 'Events' },
  { opcode: 'motion_movesteps', label: 'move (steps) steps', category: 'Motion' },
  { opcode: 'motion_turnright', label: 'turn right (degrees)', category: 'Motion' },
  { opcode: 'motion_turnleft', label: 'turn left (degrees)', category: 'Motion' },
  { opcode: 'motion_gotoxy', label: 'go to x:(X) y:(Y)', category: 'Motion' },
  { opcode: 'motion_glidesecstoxy', label: 'glide (SECS) secs to x/y', category: 'Motion' },
  { opcode: 'motion_ifonedgebounce', label: 'if on edge, bounce', category: 'Motion' },
  { opcode: 'looks_sayforsecs', label: 'say (MESSAGE) for (SECS) seconds', category: 'Looks' },
  { opcode: 'looks_say', label: 'say (MESSAGE)', category: 'Looks' },
  { opcode: 'looks_nextcostume', label: 'next costume', category: 'Looks' },
  { opcode: 'looks_switchbackdropto', label: 'switch backdrop to', category: 'Looks' },
  { opcode: 'looks_show', label: 'show', category: 'Looks' },
  { opcode: 'looks_hide', label: 'hide', category: 'Looks' },
  { opcode: 'sound_playuntildone', label: 'play sound until done', category: 'Sound' },
  { opcode: 'sound_play', label: 'start sound', category: 'Sound' },
  { opcode: 'control_wait', label: 'wait (DURATION) seconds', category: 'Control' },
  { opcode: 'control_repeat', label: 'repeat (TIMES)', category: 'Control' },
  { opcode: 'control_forever', label: 'forever', category: 'Control' },
  { opcode: 'control_if', label: 'if <> then', category: 'Control' },
  { opcode: 'control_if_else', label: 'if <> then ... else ...', category: 'Control' },
  { opcode: 'control_repeat_until', label: 'repeat until <>', category: 'Control' },
  { opcode: 'sensing_touchingobject', label: 'touching [object]?', category: 'Sensing' },
  { opcode: 'sensing_askandwait', label: 'ask (QUESTION) and wait', category: 'Sensing' },
  { opcode: 'data_setvariableto', label: 'set [variable] to (VALUE)', category: 'Variables' },
  { opcode: 'data_changevariableby', label: 'change [variable] by (VALUE)', category: 'Variables' },
];

export function runClientAutoGradePreview(
  projectJson: Record<string, any>,
  criteria: CodingLabRubricCriterion[]
): CodingLabAutoGradeResult {
  return gradeScratchProject(projectJson, criteria);
}
