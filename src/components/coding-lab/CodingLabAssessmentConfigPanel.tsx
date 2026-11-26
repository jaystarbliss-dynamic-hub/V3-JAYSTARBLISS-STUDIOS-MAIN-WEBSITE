import React, { useRef, useState } from 'react';
import {
  Code2,
  Upload,
  Trash2,
  Plus,
  CheckCircle2,
  FileCode2,
  Loader2,
  Sliders,
  AlertCircle,
} from 'lucide-react';
import type {
  CodingLabAssessmentConfig,
  CodingLabCriterionType,
  CodingLabGradingMethod,
  CodingLabRubricCriterion,
} from '../../types/codingLab';
import {
  CODING_LAB_RUBRIC_PRESETS,
  COMMON_SCRATCH_OPCODES,
} from '../../services/codingLab/CodingLabGradingService';
import { prepareStarterProjectFromSb3 } from '../../services/codingLab/CodingLabAssessmentService';

interface CodingLabAssessmentConfigPanelProps {
  assessmentId?: string;
  config: CodingLabAssessmentConfig;
  maxScore: number;
  onChange: (nextConfig: CodingLabAssessmentConfig, suggestedMaxScore?: number) => void;
}

const makeCriterionId = () =>
  `crit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const CRITERION_TYPE_LABELS: Record<CodingLabCriterionType, string> = {
  EVENT_BLOCK_USED: 'Event Block Used (e.g. Green Flag)',
  BLOCK_PRESENT: 'Required Block Present',
  BLOCK_INPUT_VALUE: 'Block Input Value (e.g. Move 50 Steps)',
  BLOCK_FIELD_VALUE: 'Block Field / Option Match',
  BLOCK_SEQUENCE: 'Connected Block Sequence',
  BLOCK_NESTED: 'Nested Block (Inside Repeat / Forever / If)',
  VARIABLE_OR_LIST_USED: 'Variable or List Used',
  SPRITE_COUNT: 'Sprite Count Requirement',
  COSTUME_OR_BACKDROP_CHECK: 'Costume / Backdrop Count',
};

export const CodingLabAssessmentConfigPanel: React.FC<CodingLabAssessmentConfigPanelProps> = ({
  assessmentId,
  config,
  maxScore,
  onChange,
}) => {
  const starterInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingStarter, setUploadingStarter] = useState(false);
  const [starterError, setStarterError] = useState('');

  const criteria = Array.isArray(config.rubricCriteria) ? config.rubricCriteria : [];
  const autoMarksTotal = criteria.reduce((sum, c) => sum + (Number(c.marks) || 0), 0);

  const updateConfig = (patch: Partial<CodingLabAssessmentConfig>, nextMax?: number) => {
    onChange(
      {
        ...config,
        ...patch,
        programmingEnvironment: 'scratch-3-visual',
        disableCustomAudio: true,
        disableMicrophoneRecording: true,
      },
      nextMax
    );
  };

  const handleStarterFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStarterError('');
    setUploadingStarter(true);
    try {
      const starter = await prepareStarterProjectFromSb3({ file, assessmentId });
      updateConfig({ starterProject: starter });
    } catch (err) {
      setStarterError(err instanceof Error ? err.message : 'Failed to process starter .sb3 file.');
    } finally {
      setUploadingStarter(false);
    }
  };

  const addPreset = (presetIndex: number) => {
    const preset = CODING_LAB_RUBRIC_PRESETS[presetIndex];
    if (!preset) return;
    const nextCriteria: CodingLabRubricCriterion[] = [
      ...criteria,
      { ...preset.criterion, id: makeCriterionId() },
    ];
    const nextAutoTotal = nextCriteria.reduce((s, c) => s + (Number(c.marks) || 0), 0);
    const suggestedMax =
      config.gradingMethod === 'automatic'
        ? nextAutoTotal
        : config.gradingMethod === 'hybrid'
        ? nextAutoTotal + Number(config.manualRubricMaxMarks || 0)
        : maxScore;
    updateConfig({ rubricCriteria: nextCriteria }, suggestedMax);
  };

  const addCustomCriterion = () => {
    const nextCriteria: CodingLabRubricCriterion[] = [
      ...criteria,
      {
        id: makeCriterionId(),
        label: 'New structural requirement',
        type: 'BLOCK_PRESENT',
        opcode: 'motion_movesteps',
        minCount: 1,
        marks: 2,
      },
    ];
    const nextAutoTotal = nextCriteria.reduce((s, c) => s + (Number(c.marks) || 0), 0);
    updateConfig(
      { rubricCriteria: nextCriteria },
      config.gradingMethod === 'automatic' ? nextAutoTotal : undefined
    );
  };

  const updateCriterion = (id: string, patch: Partial<CodingLabRubricCriterion>) => {
    const nextCriteria = criteria.map((c) => (c.id === id ? { ...c, ...patch } : c));
    const nextAutoTotal = nextCriteria.reduce((s, c) => s + (Number(c.marks) || 0), 0);
    const suggestedMax =
      config.gradingMethod === 'automatic'
        ? nextAutoTotal
        : config.gradingMethod === 'hybrid'
        ? nextAutoTotal + Number(config.manualRubricMaxMarks || 0)
        : undefined;
    updateConfig({ rubricCriteria: nextCriteria }, suggestedMax);
  };

  const removeCriterion = (id: string) => {
    const nextCriteria = criteria.filter((c) => c.id !== id);
    const nextAutoTotal = nextCriteria.reduce((s, c) => s + (Number(c.marks) || 0), 0);
    updateConfig(
      { rubricCriteria: nextCriteria },
      config.gradingMethod === 'automatic' ? Math.max(1, nextAutoTotal) : undefined
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1E293B] text-white flex items-center justify-center">
              <Code2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Coding Lab Assessment Configuration
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Visual block-programming workspace with optional starter project, structural auto-grading, and tutor review.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
            Scratch 3 Engine • Self-Hosted
          </span>
        </div>

        {/* Grading Method & Score Policy */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Grading Method
            </label>
            <select
              value={config.gradingMethod}
              onChange={(e) => {
                const method = e.target.value as CodingLabGradingMethod;
                const nextMax =
                  method === 'automatic' && autoMarksTotal > 0
                    ? autoMarksTotal
                    : method === 'hybrid'
                    ? autoMarksTotal + Number(config.manualRubricMaxMarks || 10)
                    : maxScore || 20;
                updateConfig({ gradingMethod: method }, nextMax);
              }}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
            >
              <option value="automatic">Automatic (Structural Grading)</option>
              <option value="manual">Manual (Tutor Inspection)</option>
              <option value="hybrid">Hybrid (Automatic + Tutor Marks)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Maximum Marks
            </label>
            <input
              type="number"
              min={1}
              max={1000}
              value={maxScore || 20}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value) || 1);
                updateConfig({}, v);
              }}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Pass Mark (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={config.passMark ?? 50}
              onChange={(e) =>
                updateConfig({ passMark: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
              }
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.allowSb3Import !== false}
              onChange={(e) => updateConfig({ allowSb3Import: e.target.checked })}
              className="rounded border-slate-300 text-[#B91C1C]"
            />
            Allow learners to import local <code className="font-mono">.sb3</code> files into this task
          </label>
          <span className="text-slate-400">•</span>
          <span>Microphone recording &amp; custom audio uploads are disabled by policy.</span>
        </div>
      </div>

      {/* Optional Starter Project (.sb3) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Starter Project (Optional)
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Upload a prepared <code className="font-mono">.sb3</code> template with pre-configured sprites, backdrops, or buggy scripts for learners to complete or fix.
            </p>
          </div>
          <input
            ref={starterInputRef}
            type="file"
            accept=".sb3"
            className="hidden"
            onChange={handleStarterFileSelect}
          />
          <button
            type="button"
            disabled={uploadingStarter}
            onClick={() => starterInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {uploadingStarter ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {config.starterProject ? 'Replace Starter .sb3' : 'Upload Starter .sb3'}
          </button>
        </div>

        {starterError && (
          <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl px-3 py-2">
            <AlertCircle size={14} className="shrink-0" />
            {starterError}
          </div>
        )}

        {config.starterProject ? (
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
            <div className="flex items-center gap-3 min-w-0">
              <FileCode2 size={18} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {config.starterProject.fileName || config.starterProject.title}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                  Compressed JSON: {Math.max(1, Math.round(config.starterProject.payloadSize / 1024))} KiB •{' '}
                  {config.starterProject.assetManifest.length} linked asset(s)
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => updateConfig({ starterProject: null })}
              className="p-2 rounded-lg text-red-600 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
              title="Remove starter project"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-500 dark:text-slate-400 italic">
            No starter project attached — learners will begin with a fresh Coding Lab workspace.
          </div>
        )}
      </div>

      {/* Structural Grading Rubric Builder */}
      {config.gradingMethod !== 'manual' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders size={15} className="text-[#B91C1C]" />
                Automatic Structural Grading Rubric
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspects actual Scratch 3 block structures, inputs, connections, nested loops, and variables regardless of canvas layout.
              </p>
            </div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg tabular-nums">
              Auto Rubric Total: {autoMarksTotal} mk{autoMarksTotal === 1 ? '' : 's'}
            </div>
          </div>

          {/* Quick-Add Presets */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Quick-Add Common Checks
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CODING_LAB_RUBRIC_PRESETS.map((preset, idx) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => addPreset(idx)}
                  title={preset.summary}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                >
                  <Plus size={12} />
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Criteria List */}
          <div className="space-y-3">
            {criteria.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500 dark:text-slate-400">
                No structural criteria configured yet. Pick a quick-add check above or add a custom rule.
              </div>
            ) : (
              criteria.map((c, index) => (
                <div
                  key={c.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      Criterion #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCriterion(c.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Criterion Label (shown to learners &amp; in report)
                      </label>
                      <input
                        type="text"
                        value={c.label}
                        onChange={(e) => updateCriterion(c.id, { label: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="md:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Rule Type
                      </label>
                      <select
                        value={c.type}
                        onChange={(e) =>
                          updateCriterion(c.id, { type: e.target.value as CodingLabCriterionType })
                        }
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                      >
                        {(Object.keys(CRITERION_TYPE_LABELS) as CodingLabCriterionType[]).map((t) => (
                          <option key={t} value={t}>
                            {CRITERION_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Marks
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step={0.5}
                        value={c.marks}
                        onChange={(e) =>
                          updateCriterion(c.id, { marks: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Type-Specific Parameters */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    {(c.type === 'EVENT_BLOCK_USED' ||
                      c.type === 'BLOCK_PRESENT' ||
                      c.type === 'BLOCK_INPUT_VALUE' ||
                      c.type === 'BLOCK_FIELD_VALUE') && (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Scratch Block Opcode
                        </label>
                        <select
                          value={c.opcode || 'event_whenflagclicked'}
                          onChange={(e) => updateCriterion(c.id, { opcode: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                        >
                          {COMMON_SCRATCH_OPCODES.map((op) => (
                            <option key={op.opcode} value={op.opcode}>
                              [{op.category}] {op.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {c.type === 'BLOCK_PRESENT' && (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Minimum Block Count
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={c.minCount ?? 1}
                          onChange={(e) =>
                            updateCriterion(c.id, { minCount: Math.max(1, Number(e.target.value) || 1) })
                          }
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    )}

                    {c.type === 'BLOCK_INPUT_VALUE' && (
                      <>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Input Name (e.g. STEPS, DEGREES, TIMES, MESSAGE)
                          </label>
                          <input
                            type="text"
                            value={c.inputName || 'STEPS'}
                            onChange={(e) =>
                              updateCriterion(c.id, { inputName: e.target.value.toUpperCase() })
                            }
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Expected Value
                          </label>
                          <input
                            type="text"
                            value={c.expectedValue ?? ''}
                            onChange={(e) => updateCriterion(c.id, { expectedValue: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </>
                    )}

                    {c.type === 'BLOCK_FIELD_VALUE' && (
                      <>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Field Name (e.g. KEY_OPTION)
                          </label>
                          <input
                            type="text"
                            value={c.fieldName || 'KEY_OPTION'}
                            onChange={(e) =>
                              updateCriterion(c.id, { fieldName: e.target.value.toUpperCase() })
                            }
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Expected Field Value
                          </label>
                          <input
                            type="text"
                            value={c.expectedValue ?? ''}
                            onChange={(e) => updateCriterion(c.id, { expectedValue: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </>
                    )}

                    {c.type === 'BLOCK_SEQUENCE' && (
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Ordered Opcodes (comma-separated, e.g. event_whenflagclicked, motion_movesteps, motion_turnright)
                        </label>
                        <input
                          type="text"
                          value={(c.opcodes || []).join(', ')}
                          onChange={(e) =>
                            updateCriterion(c.id, {
                              opcodes: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                    )}

                    {c.type === 'BLOCK_NESTED' && (
                      <>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Outer Control Block
                          </label>
                          <select
                            value={c.outerOpcode || 'control_repeat'}
                            onChange={(e) => updateCriterion(c.id, { outerOpcode: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                          >
                            <option value="control_repeat">repeat (TIMES)</option>
                            <option value="control_forever">forever</option>
                            <option value="control_if">if &lt;&gt; then</option>
                            <option value="control_if_else">if &lt;&gt; then ... else</option>
                            <option value="control_repeat_until">repeat until</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Required Inner Block
                          </label>
                          <select
                            value={c.innerOpcode || 'motion_movesteps'}
                            onChange={(e) => updateCriterion(c.id, { innerOpcode: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                          >
                            {COMMON_SCRATCH_OPCODES.map((op) => (
                              <option key={op.opcode} value={op.opcode}>
                                [{op.category}] {op.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Repeat Times (optional)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 4"
                            value={c.outerExpectedValue ?? ''}
                            onChange={(e) =>
                              updateCriterion(c.id, {
                                outerInputName: e.target.value ? 'TIMES' : '',
                                outerExpectedValue: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </>
                    )}

                    {c.type === 'VARIABLE_OR_LIST_USED' && (
                      <>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Type
                          </label>
                          <select
                            value={c.variableKind || 'variable'}
                            onChange={(e) =>
                              updateCriterion(c.id, {
                                variableKind: e.target.value as 'variable' | 'list' | 'either',
                              })
                            }
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                          >
                            <option value="variable">Variable</option>
                            <option value="list">List</option>
                            <option value="either">Variable or List</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Expected Name (leave blank for any)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. score"
                            value={c.variableName || ''}
                            onChange={(e) => updateCriterion(c.id, { variableName: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </>
                    )}

                    {c.type === 'SPRITE_COUNT' && (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Minimum Sprites
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={c.minSprites ?? 2}
                          onChange={(e) =>
                            updateCriterion(c.id, { minSprites: Math.max(1, Number(e.target.value) || 1) })
                          }
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    )}

                    {c.type === 'COSTUME_OR_BACKDROP_CHECK' && (
                      <>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Target
                          </label>
                          <select
                            value={c.assetTargetKind || 'sprite'}
                            onChange={(e) =>
                              updateCriterion(c.id, {
                                assetTargetKind: e.target.value as 'sprite' | 'stage',
                              })
                            }
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                          >
                            <option value="sprite">Sprite Costumes</option>
                            <option value="stage">Stage Backdrops</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Minimum Count
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={c.minCount ?? 2}
                            onChange={(e) =>
                              updateCriterion(c.id, { minCount: Math.max(1, Number(e.target.value) || 1) })
                            }
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={addCustomCriterion}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Plus size={14} />
            Add Custom Structural Rule
          </button>

          {config.gradingMethod === 'hybrid' && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
              <span>
                In <strong>Hybrid</strong> mode, automatic criteria award up to <strong>{autoMarksTotal}</strong> marks and tutors add manual marks / creativity feedback up to the assessment maximum of <strong>{maxScore}</strong>.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CodingLabAssessmentConfigPanel;
