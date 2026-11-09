import React, { useState, useMemo, useEffect } from 'react';
import {
  GripVertical,
  Plus,
  Edit3,
  Trash2,
  ChevronRight,
  Eye,
  Save,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  FileText,
  ExternalLink,
  X,
  Check,
} from 'lucide-react';
import { getProgramBreadcrumbs } from '../../../lib/programHierarchy';
import {
  NODE_TYPE_META,
  getProgramCoverImage,
  type PreviewProgramRecord,
} from './types';

interface CurriculumWorkspaceViewProps {
  programs: PreviewProgramRecord[];
  programsMap: Map<string, PreviewProgramRecord>;
  selectedProgramId: string | null;
  onSelectProgram: (programId: string) => void;
  onSaveCurriculum: (
    programId: string,
    payload: {
      curriculumTitle: string;
      curriculumPdfUrl: string;
      curriculumSummary: string;
      curriculum: string[];
      learningObjectives: string[];
      prerequisiteProgramIds: string[];
      progressionRule: 'sequential' | 'flexible';
      isRequired: boolean;
    }
  ) => void;
}

type CurriculumSubTab = 'modules' | 'overview' | 'objectives' | 'resources';

export const CurriculumWorkspaceView: React.FC<CurriculumWorkspaceViewProps> = ({
  programs,
  programsMap,
  selectedProgramId,
  onSelectProgram,
  onSaveCurriculum,
}) => {
  const activePrograms = useMemo(
    () => programs.filter((p) => !p.isArchived),
    [programs]
  );

  const selectedProgram = useMemo(() => {
    if (selectedProgramId && programsMap.has(selectedProgramId)) {
      return programsMap.get(selectedProgramId)!;
    }
    return (
      programsMap.get('prog-web-development') ||
      activePrograms.find((p) => p.nodeType !== 'CONTAINER') ||
      activePrograms[0] ||
      null
    );
  }, [selectedProgramId, programsMap, activePrograms]);

  const [activeSubTab, setActiveSubTab] = useState<CurriculumSubTab>('modules');
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Local editable state
  const [curriculumTitle, setCurriculumTitle] = useState('');
  const [curriculumPdfUrl, setCurriculumPdfUrl] = useState('');
  const [curriculumSummary, setCurriculumSummary] = useState('');
  const [modules, setModules] = useState<string[]>([]);
  const [objectives, setObjectives] = useState<string[]>([]);
  const [prerequisiteIds, setPrerequisiteIds] = useState<string[]>([]);
  const [progressionRule, setProgressionRule] = useState<'sequential' | 'flexible'>('sequential');
  const [isRequired, setIsRequired] = useState<boolean>(true);

  // Add / Edit Module state
  const [isAddingModule, setIsAddingModule] = useState(false);
  const [newModuleText, setNewModuleText] = useState('');
  const [editingModuleIdx, setEditingModuleIdx] = useState<number | null>(null);
  const [editingModuleValue, setEditingModuleValue] = useState('');

  // Add Objective state
  const [newObjectiveText, setNewObjectiveText] = useState('');

  useEffect(() => {
    if (!selectedProgram) return;
    setCurriculumTitle(
      selectedProgram.curriculumTitle || `${selectedProgram.title} Master Syllabus`
    );
    setCurriculumPdfUrl(selectedProgram.curriculumPdfUrl || '');
    setCurriculumSummary(
      selectedProgram.curriculumSummary || selectedProgram.shortDescription || ''
    );
    setModules(
      selectedProgram.curriculum?.length
        ? [...selectedProgram.curriculum]
        : [
            'Introduction to Web Development',
            'HTML and CSS Foundations',
            'JavaScript Basics & DOM Logic',
            'Building & Deploying Projects',
          ]
    );
    setObjectives([...(selectedProgram.learningObjectives || [])]);
    setPrerequisiteIds([...(selectedProgram.prerequisiteProgramIds || [])]);
    setProgressionRule(selectedProgram.progressionRule || 'sequential');
    setIsRequired(selectedProgram.isRequired !== false);
    setEditingModuleIdx(null);
    setIsAddingModule(false);
  }, [selectedProgram]);

  const handleSave = () => {
    if (!selectedProgram) return;
    onSaveCurriculum(selectedProgram.id, {
      curriculumTitle: curriculumTitle.trim(),
      curriculumPdfUrl: curriculumPdfUrl.trim(),
      curriculumSummary: curriculumSummary.trim(),
      curriculum: modules,
      learningObjectives: objectives,
      prerequisiteProgramIds: prerequisiteIds,
      progressionRule,
      isRequired,
    });
  };

  const handleAddModule = () => {
    if (!newModuleText.trim()) return;
    setModules((prev) => [...prev, newModuleText.trim()]);
    setNewModuleText('');
    setIsAddingModule(false);
  };

  const handleMoveModule = (idx: number, dir: 'UP' | 'DOWN') => {
    const target = dir === 'UP' ? idx - 1 : idx + 1;
    if (target < 0 || target >= modules.length) return;
    setModules((prev) => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const handleDeleteModule = (idx: number) => {
    setModules((prev) => prev.filter((_, i) => i !== idx));
  };

  const formatCleanModuleTitle = (raw: string, idx: number) => {
    const cleaned = raw.replace(/^(Module|Unit|Stage)\s*\d+\s*:\s*/i, '').trim();
    return {
      shortTitle: cleaned || raw,
      fullTitle: `Module ${idx + 1}: ${cleaned || raw}`,
      lessonMeta: `${4 + (idx % 3)} lessons • ${2 + (idx % 2)} hours`,
    };
  };

  if (!selectedProgram) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-xs text-slate-500">
        No active programme available to configure curriculum.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Curriculum Builder Bar (Matches Image 2 Top-Right & Image 3 Middle-Left) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl px-5 py-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Curriculum Builder</h2>
          <p className="text-xs text-slate-500">
            Manage modules, lessons and learning objectives
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Programme Switcher Dropdown */}
          <select
            aria-label="Select programme for curriculum builder"
            value={selectedProgram.id}
            onChange={(e) => onSelectProgram(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-400 cursor-pointer max-w-[240px]"
          >
            {activePrograms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Eye size={14} className="text-slate-500" />
            <span>Preview</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
          >
            <Save size={14} />
            <span>Save Changes</span>
          </button>
        </div>
      </div>

      {/* Two-Column Curriculum Builder Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT SIDEBAR: Selected Programme Card + Vertical Section Steps (~3.5 cols) */}
        <div className="lg:col-span-4 xl:col-span-3 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-4">
          {/* Selected Programme Mini-Card (Matches Image 3 Middle-Left!) */}
          <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 flex items-center gap-3">
            <img
              src={getProgramCoverImage(selectedProgram)}
              alt={selectedProgram.title}
              className="w-14 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
            />
            <div className="min-w-0">
              <div className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
                {selectedProgram.title}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {selectedProgram.isPublished ? 'Published' : 'Draft'}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  {NODE_TYPE_META[selectedProgram.nodeType]?.badgeLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Numbered / Diamond Vertical Navigation Steps (Matches Image 2 Top-Right & Image 3 Middle-Left) */}
          <nav aria-label="Curriculum sections" className="space-y-1">
            {(
              [
                { id: 'overview', num: 1, label: 'Overview & Syllabus' },
                { id: 'modules', num: 2, label: 'Modules', count: modules.length },
                { id: 'objectives', num: 3, label: 'Objectives', count: objectives.length },
                { id: 'resources', num: 4, label: 'Resources & Settings' },
              ] as const
            ).map((step) => {
              const active = activeSubTab === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveSubTab(step.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? 'bg-red-50/90 text-[#B91C1C]'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center tabular-nums ${
                        active
                          ? 'bg-[#B91C1C] text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {step.num}
                    </span>
                    <span>{step.label}</span>
                  </div>
                  {'count' in step && typeof step.count === 'number' && (
                    <span
                      className={`text-[11px] tabular-nums ${
                        active ? 'text-[#B91C1C] font-extrabold' : 'text-slate-400'
                      }`}
                    >
                      {step.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* RIGHT MAIN CARD: Course Modules / Syllabus / Objectives (~8.5 cols) */}
        <div className="lg:col-span-8 xl:col-span-9 bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs">
          {/* TAB: MODULES (Default active view matching Image 2 Top-Right & Image 3 Middle-Left) */}
          {activeSubTab === 'modules' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Course Modules
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ordered learning modules for {selectedProgram.title}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddingModule(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Add Module</span>
                </button>
              </div>

              {/* Inline Add Module Box */}
              {isAddingModule && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <input
                    type="text"
                    value={newModuleText}
                    onChange={(e) => setNewModuleText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddModule();
                      }
                    }}
                    placeholder="Enter module title (e.g. Responsive Web Design & Flexbox)..."
                    className="flex-1 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-slate-500"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddModule}
                      className="px-3.5 py-2 rounded-xl bg-[#B91C1C] text-white text-xs font-bold hover:bg-[#991B1B]"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingModule(false);
                        setNewModuleText('');
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Ordered Module Cards (Matches Image 2 Top-Right & Image 3 Middle-Left!) */}
              <div className="space-y-2.5">
                {modules.map((rawMod, idx) => {
                  const meta = formatCleanModuleTitle(rawMod, idx);
                  const isEditingThis = editingModuleIdx === idx;

                  return (
                    <div
                      key={idx}
                      className="group p-3.5 sm:px-4 sm:py-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-2xs transition-all flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <GripVertical
                          size={16}
                          className="text-slate-400 shrink-0 cursor-grab"
                        />
                        <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-100 font-extrabold text-xs flex items-center justify-center shrink-0 tabular-nums">
                          {idx + 1}
                        </span>

                        {isEditingThis ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={editingModuleValue}
                              onChange={(e) => setEditingModuleValue(e.target.value)}
                              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-900"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (editingModuleValue.trim()) {
                                  setModules((prev) =>
                                    prev.map((m, i) =>
                                      i === idx ? editingModuleValue.trim() : m
                                    )
                                  );
                                }
                                setEditingModuleIdx(null);
                              }}
                              className="p-1.5 rounded-lg bg-emerald-600 text-white"
                              title="Save module title"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingModuleIdx(null)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-500"
                              title="Cancel"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pr-2">
                            <div>
                              <div className="font-bold text-xs sm:text-sm text-indigo-950 truncate">
                                {meta.shortTitle}
                              </div>
                              <div className="text-[11px] text-slate-500 sm:hidden">
                                {meta.lessonMeta}
                              </div>
                            </div>
                            <span className="hidden sm:inline text-xs font-semibold text-slate-500 tabular-nums shrink-0">
                              {meta.lessonMeta}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right Actions: Up/Down, Edit Pencil, Delete Trash, Chevron */}
                      {!isEditingThis && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveModule(idx, 'UP')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                            title="Move module up"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === modules.length - 1}
                            onClick={() => handleMoveModule(idx, 'DOWN')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                            title="Move module down"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingModuleIdx(idx);
                              setEditingModuleValue(meta.shortTitle);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                            title="Edit module"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteModule(idx)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#B91C1C] hover:bg-red-50 cursor-pointer"
                            title="Delete module"
                          >
                            <Trash2 size={14} />
                          </button>
                          <ChevronRight size={15} className="text-slate-400 ml-0.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: OVERVIEW & SYLLABUS */}
          {activeSubTab === 'overview' && (
            <div className="space-y-4">
              <div className="pb-3 border-b border-slate-100">
                <h3 className="text-base font-extrabold text-slate-900">
                  Curriculum Overview &amp; Syllabus
                </h3>
                <p className="text-xs text-slate-500">
                  Configure the official syllabus title, PDF link, and executive summary
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Curriculum Document Title
                  </label>
                  <input
                    type="text"
                    value={curriculumTitle}
                    onChange={(e) => setCurriculumTitle(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Syllabus PDF URL
                  </label>
                  <input
                    type="url"
                    value={curriculumPdfUrl}
                    onChange={(e) => setCurriculumPdfUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Curriculum Summary
                </label>
                <textarea
                  rows={4}
                  value={curriculumSummary}
                  onChange={(e) => setCurriculumSummary(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-slate-400"
                />
              </div>
            </div>
          )}

          {/* TAB: LEARNING OBJECTIVES */}
          {activeSubTab === 'objectives' && (
            <div className="space-y-4">
              <div className="pb-3 border-b border-slate-100">
                <h3 className="text-base font-extrabold text-slate-900">
                  Learning Objectives ({objectives.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Measurable outcomes students will achieve upon completing {selectedProgram.title}
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newObjectiveText}
                  onChange={(e) => setNewObjectiveText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newObjectiveText.trim()) {
                      e.preventDefault();
                      setObjectives((prev) => [...prev, newObjectiveText.trim()]);
                      setNewObjectiveText('');
                    }
                  }}
                  placeholder="Add a learning objective..."
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newObjectiveText.trim()) return;
                    setObjectives((prev) => [...prev, newObjectiveText.trim()]);
                    setNewObjectiveText('');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#B91C1C] text-white text-xs font-bold hover:bg-[#991B1B]"
                >
                  Add Objective
                </button>
              </div>

              <div className="space-y-2">
                {objectives.map((obj, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                      <span className="font-semibold text-slate-800">{obj}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setObjectives((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-1 text-slate-400 hover:text-[#B91C1C]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: RESOURCES & SETTINGS */}
          {activeSubTab === 'resources' && (
            <div className="space-y-4 text-xs">
              <div className="pb-3 border-b border-slate-100">
                <h3 className="text-base font-extrabold text-slate-900">
                  Resources &amp; Progression Settings
                </h3>
                <p className="text-xs text-slate-500">
                  Configure progression mode and required completion flags
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 space-y-2">
                  <label className="block font-bold text-slate-900">
                    Progression Mode
                  </label>
                  <select
                    value={progressionRule}
                    onChange={(e) =>
                      setProgressionRule(e.target.value as 'sequential' | 'flexible')
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-semibold text-slate-800"
                  >
                    <option value="sequential">Sequential (Ordered Completion)</option>
                    <option value="flexible">Flexible (Any Order)</option>
                  </select>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">
                      Required in Parent Track
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Mandatory for parent programme completion
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isRequired}
                    onChange={(e) => setIsRequired(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#B91C1C]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Curriculum Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText size={18} className="text-[#B91C1C]" />
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {curriculumTitle || selectedProgram.title}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {getProgramBreadcrumbs(selectedProgram.id, programsMap).path}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs max-h-[70vh] overflow-y-auto">
              <p className="text-slate-600 leading-relaxed">{curriculumSummary}</p>
              <div>
                <h4 className="font-bold text-slate-900 mb-2">
                  Modules ({modules.length})
                </h4>
                <div className="space-y-2">
                  {modules.map((m, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-semibold text-slate-800"
                    >
                      {formatCleanModuleTitle(m, i).fullTitle}
                    </div>
                  ))}
                </div>
              </div>
              {curriculumPdfUrl && (
                <a
                  href={curriculumPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[#B91C1C] font-bold hover:underline"
                >
                  <span>Open Attached Syllabus PDF</span>
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
