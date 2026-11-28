import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  FileText,
  FolderPlus,
  Info,
  Plus,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import type {
  AssessmentComprehensionItem,
  AssessmentContentBlockItem,
  AssessmentLayout,
  AssessmentSection,
  AssessmentSectionItem,
} from '../../lib/classes';
import { NativeQuestionCard, type NativeQuestionData } from './NativeQuestionCard';

const makeBlockId = (prefix: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID().slice(0, 8)}`
    : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

interface AutoGrowTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minRows?: number;
  minHeightPx?: number;
  className?: string;
  ariaLabel?: string;
}

const AutoGrowTextarea: React.FC<AutoGrowTextareaProps> = ({
  value,
  onChange,
  placeholder,
  minRows = 5,
  minHeightPx = 128,
  className = '',
  ariaLabel,
}) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(minHeightPx, el.scrollHeight)}px`;
  }, [value, minHeightPx]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 px-3.5 py-3 text-sm text-slate-900 dark:text-slate-100 leading-relaxed focus:border-[#1E293B] dark:focus:border-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:outline-none resize-y transition-colors ${className}`}
    />
  );
};

interface AssessmentLayoutBuilderProps {
  layout: AssessmentLayout;
  questions: NativeQuestionData[];
  activeQuestionId: string;
  defaultPointValue: number;
  onSelectQuestion: (questionId: string) => void;
  onChangeLayoutAndQuestions: (nextLayout: AssessmentLayout, nextQuestions: NativeQuestionData[]) => void;
  onUpdateQuestion: (questionId: string, updated: NativeQuestionData) => void;
  onDuplicateQuestion: (questionId: string, sectionId: string, comprehensionId?: string) => void;
  onDeleteQuestion: (questionId: string) => void;
  createBlankQuestion: () => NativeQuestionData;
}

export const AssessmentLayoutBuilder: React.FC<AssessmentLayoutBuilderProps> = ({
  layout,
  questions,
  activeQuestionId,
  onSelectQuestion,
  onChangeLayoutAndQuestions,
  onUpdateQuestion,
  onDuplicateQuestion,
  onDeleteQuestion,
  createBlankQuestion,
}) => {
  const [pendingDeletePassage, setPendingDeletePassage] = useState<{
    sectionId: string;
    item: AssessmentComprehensionItem;
  } | null>(null);

  const questionMap = new Map<string, NativeQuestionData>();
  const questionNumberMap = new Map<string, number>();
  questions.forEach((q, idx) => {
    questionMap.set(q.id, q);
    questionNumberMap.set(q.id, idx);
  });

  // Sync flat questions array order to match layout order so legacy consumers & numbering stay consistent
  const syncQuestionsOrder = (
    nextLayout: AssessmentLayout,
    candidateQuestions: NativeQuestionData[]
  ): NativeQuestionData[] => {
    const map = new Map<string, NativeQuestionData>();
    candidateQuestions.forEach((q) => map.set(q.id, q));
    const ordered: NativeQuestionData[] = [];
    const seen = new Set<string>();
    nextLayout.sections.forEach((sec) => {
      sec.items.forEach((item) => {
        if (item.kind === 'question') {
          const q = map.get(item.questionId);
          if (q && !seen.has(q.id)) {
            seen.add(q.id);
            ordered.push(q);
          }
        } else if (item.kind === 'comprehension') {
          item.questionIds.forEach((qid) => {
            const q = map.get(qid);
            if (q && !seen.has(q.id)) {
              seen.add(q.id);
              ordered.push(q);
            }
          });
        }
      });
    });
    candidateQuestions.forEach((q) => {
      if (!seen.has(q.id)) ordered.push(q);
    });
    return ordered;
  };

  const commit = (nextLayout: AssessmentLayout, nextQuestions: NativeQuestionData[] = questions) => {
    const ordered = syncQuestionsOrder(nextLayout, nextQuestions);
    onChangeLayoutAndQuestions(nextLayout, ordered);
  };

  const targetDefaultSectionId =
    layout.sections[layout.sections.length - 1]?.id || 'sec-1';

  // Section operations
  const handleAddSection = () => {
    const nextNum = layout.sections.length + 1;
    const newSec: AssessmentSection = {
      id: makeBlockId('sec'),
      title: `Section ${nextNum}`,
      description: '',
      items: [],
    };
    commit({ ...layout, sections: [...layout.sections, newSec] });
  };

  const handleUpdateSection = (sectionId: string, patch: Partial<AssessmentSection>) => {
    commit({
      ...layout,
      sections: layout.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
    });
  };

  const handleMoveSection = (sectionIdx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? sectionIdx - 1 : sectionIdx + 1;
    if (targetIdx < 0 || targetIdx >= layout.sections.length) return;
    const nextSections = [...layout.sections];
    const [moved] = nextSections.splice(sectionIdx, 1);
    nextSections.splice(targetIdx, 0, moved);
    commit({ ...layout, sections: nextSections });
  };

  const handleDeleteSection = (sectionId: string) => {
    if (layout.sections.length <= 1) return;
    const secIdx = layout.sections.findIndex((s) => s.id === sectionId);
    if (secIdx === -1) return;
    const removed = layout.sections[secIdx];
    const remaining = layout.sections.filter((s) => s.id !== sectionId);
    const mergeIdx = Math.max(0, secIdx - 1);
    // Preserve all items (never silently drop questions or passages)
    remaining[mergeIdx] = {
      ...remaining[mergeIdx],
      items: [...remaining[mergeIdx].items, ...removed.items],
    };
    commit({ ...layout, sections: remaining });
  };

  // Item insertion operations
  const handleAddStandaloneQuestion = (sectionId: string, insertIndex?: number) => {
    const newQ = createBlankQuestion();
    const newItem: AssessmentSectionItem = {
      id: makeBlockId('qref'),
      kind: 'question',
      questionId: newQ.id,
    };
    const nextLayout: AssessmentLayout = {
      ...layout,
      sections: layout.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const nextItems = [...sec.items];
        if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= nextItems.length) {
          nextItems.splice(insertIndex, 0, newItem);
        } else {
          nextItems.push(newItem);
        }
        return { ...sec, items: nextItems };
      }),
    };
    commit(nextLayout, [...questions, newQ]);
    onSelectQuestion(newQ.id);
  };

  const handleAddContentBlock = (
    sectionId: string,
    blockType: 'instruction' | 'text' = 'instruction'
  ) => {
    const newItem: AssessmentContentBlockItem = {
      id: makeBlockId('blk'),
      kind: 'content',
      blockType,
      title: blockType === 'instruction' ? 'Section Instructions' : '',
      body: '',
    };
    commit({
      ...layout,
      sections: layout.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, items: [...sec.items, newItem] } : sec
      ),
    });
  };

  const handleAddComprehensionGroup = (sectionId: string) => {
    const firstChildQ = createBlankQuestion();
    const newGroup: AssessmentComprehensionItem = {
      id: makeBlockId('comp'),
      kind: 'comprehension',
      title: 'Reading Passage',
      body: '',
      questionIds: [firstChildQ.id],
    };
    const nextLayout: AssessmentLayout = {
      ...layout,
      sections: layout.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, items: [...sec.items, newGroup] } : sec
      ),
    };
    commit(nextLayout, [...questions, firstChildQ]);
    onSelectQuestion(firstChildQ.id);
  };

  const handleUpdateSectionItem = (
    sectionId: string,
    itemId: string,
    updater: (item: AssessmentSectionItem) => AssessmentSectionItem
  ) => {
    commit({
      ...layout,
      sections: layout.sections.map((sec) =>
        sec.id === sectionId
          ? { ...sec, items: sec.items.map((it) => (it.id === itemId ? updater(it) : it)) }
          : sec
      ),
    });
  };

  const handleMoveSectionItem = (sectionId: string, itemIdx: number, direction: 'up' | 'down') => {
    const sec = layout.sections.find((s) => s.id === sectionId);
    if (!sec) return;
    const targetIdx = direction === 'up' ? itemIdx - 1 : itemIdx + 1;
    if (targetIdx < 0 || targetIdx >= sec.items.length) return;
    const nextItems = [...sec.items];
    const [moved] = nextItems.splice(itemIdx, 1);
    nextItems.splice(targetIdx, 0, moved);
    commit({
      ...layout,
      sections: layout.sections.map((s) => (s.id === sectionId ? { ...s, items: nextItems } : s)),
    });
  };

  const handleDeleteContentBlock = (sectionId: string, itemId: string) => {
    commit({
      ...layout,
      sections: layout.sections.map((sec) =>
        sec.id === sectionId
          ? { ...sec, items: sec.items.filter((it) => it.id !== itemId) }
          : sec
      ),
    });
  };

  // Comprehension group child question operations
  const handleAddQuestionToComprehension = (
    sectionId: string,
    groupId: string,
    insertIndex?: number
  ) => {
    const newQ = createBlankQuestion();
    const nextLayout: AssessmentLayout = {
      ...layout,
      sections: layout.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          items: sec.items.map((item) => {
            if (item.kind !== 'comprehension' || item.id !== groupId) return item;
            const nextIds = [...item.questionIds];
            if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= nextIds.length) {
              nextIds.splice(insertIndex, 0, newQ.id);
            } else {
              nextIds.push(newQ.id);
            }
            return { ...item, questionIds: nextIds };
          }),
        };
      }),
    };
    commit(nextLayout, [...questions, newQ]);
    onSelectQuestion(newQ.id);
  };

  const handleMoveQuestionInComprehension = (
    sectionId: string,
    groupId: string,
    childIdx: number,
    direction: 'up' | 'down'
  ) => {
    const targetIdx = direction === 'up' ? childIdx - 1 : childIdx + 1;
    handleUpdateSectionItem(sectionId, groupId, (item) => {
      if (item.kind !== 'comprehension') return item;
      if (targetIdx < 0 || targetIdx >= item.questionIds.length) return item;
      const nextIds = [...item.questionIds];
      const [moved] = nextIds.splice(childIdx, 1);
      nextIds.splice(targetIdx, 0, moved);
      return { ...item, questionIds: nextIds };
    });
  };

  const handleUnlinkQuestionFromComprehension = (
    sectionId: string,
    groupId: string,
    questionId: string
  ) => {
    const nextLayout: AssessmentLayout = {
      ...layout,
      sections: layout.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const groupIdx = sec.items.findIndex(
          (it) => it.kind === 'comprehension' && it.id === groupId
        );
        if (groupIdx === -1) return sec;
        const group = sec.items[groupIdx] as AssessmentComprehensionItem;
        const updatedGroup: AssessmentComprehensionItem = {
          ...group,
          questionIds: group.questionIds.filter((id) => id !== questionId),
        };
        const nextItems = [...sec.items];
        nextItems[groupIdx] = updatedGroup;
        nextItems.splice(groupIdx + 1, 0, {
          id: makeBlockId('qref'),
          kind: 'question',
          questionId,
        });
        return { ...sec, items: nextItems };
      }),
    };
    commit(nextLayout);
  };

  const handleConfirmDeletePassage = (mode: 'unlink' | 'delete_all') => {
    if (!pendingDeletePassage) return;
    const { sectionId, item } = pendingDeletePassage;

    if (mode === 'delete_all') {
      const remainingQuestions = questions.filter((q) => !item.questionIds.includes(q.id));
      if (remainingQuestions.length === 0) {
        // Keep at least one question by switching to unlink if deleting all would leave 0 questions
        mode = 'unlink';
      } else {
        const nextLayout: AssessmentLayout = {
          ...layout,
          sections: layout.sections.map((sec) =>
            sec.id === sectionId
              ? { ...sec, items: sec.items.filter((it) => it.id !== item.id) }
              : sec
          ),
        };
        commit(nextLayout, remainingQuestions);
        setPendingDeletePassage(null);
        return;
      }
    }

    // Unlink mode: convert linked questions to standalone question refs right where the passage was
    const nextLayout: AssessmentLayout = {
      ...layout,
      sections: layout.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const idx = sec.items.findIndex((it) => it.id === item.id);
        if (idx === -1) return sec;
        const replacementItems: AssessmentSectionItem[] = item.questionIds.map((qid) => ({
          id: makeBlockId('qref'),
          kind: 'question',
          questionId: qid,
        }));
        const nextItems = [...sec.items];
        nextItems.splice(idx, 1, ...replacementItems);
        return { ...sec, items: nextItems };
      }),
    };
    commit(nextLayout);
    setPendingDeletePassage(null);
  };

  const handleRequestDeletePassage = (sectionId: string, item: AssessmentComprehensionItem) => {
    if (item.questionIds.length === 0) {
      handleDeleteContentBlock(sectionId, item.id);
      return;
    }
    setPendingDeletePassage({ sectionId, item });
  };

  const canDeleteAllFromPendingPassage = pendingDeletePassage
    ? questions.length - pendingDeletePassage.item.questionIds.length >= 1
    : false;

  return (
    <div className="space-y-5">
      {/* Structured Add Content Toolbar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121620] px-4 py-3 flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          Add to assessment
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleAddStandaloneQuestion(targetDefaultSectionId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Plus size={14} /> Add Question
          </button>
          <button
            type="button"
            onClick={() => handleAddComprehensionGroup(targetDefaultSectionId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <BookOpen size={14} className="text-[#B91C1C] dark:text-red-400" /> Add Comprehension Passage
          </button>
          <button
            type="button"
            onClick={() => handleAddContentBlock(targetDefaultSectionId, 'instruction')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <FileText size={14} className="text-slate-500 dark:text-slate-400" /> Add Text / Instructions
          </button>
          <button
            type="button"
            onClick={handleAddSection}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <FolderPlus size={14} className="text-slate-500 dark:text-slate-400" /> Add Section
          </button>
        </div>
      </div>

      {/* Sections List */}
      {layout.sections.map((section, sectionIdx) => {
        const showSectionChrome = layout.sections.length > 1 || Boolean(section.description?.trim()) || (section.title.trim() !== '' && section.title.trim() !== 'Section 1');
        return (
          <section key={section.id} className="space-y-4">
            {/* Section Header Card */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#121620] px-4 py-3.5 sm:px-5 sm:py-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                    Section {sectionIdx + 1} of {layout.sections.length}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>0 marks</span>
                </div>
                <div className="flex items-center gap-1">
                  {layout.sections.length > 1 && (
                    <>
                      <button
                        type="button"
                        disabled={sectionIdx === 0}
                        onClick={() => handleMoveSection(sectionIdx, 'up')}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                        title="Move section up"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={sectionIdx === layout.sections.length - 1}
                        onClick={() => handleMoveSection(sectionIdx, 'down')}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                        title="Move section down"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSection(section.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-[#B91C1C] hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Remove section (items move to previous section)"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <input
                type="text"
                value={section.title}
                onChange={(e) => handleUpdateSection(section.id, { title: e.target.value })}
                placeholder={`Section ${sectionIdx + 1} Title (e.g. Part A — Reading Comprehension)`}
                className="w-full text-sm sm:text-base font-bold text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-[#1E293B] dark:focus:border-slate-400 focus:outline-none py-1"
              />
              {(showSectionChrome || section.description !== '') && (
                <input
                  type="text"
                  value={section.description || ''}
                  onChange={(e) => handleUpdateSection(section.id, { description: e.target.value })}
                  placeholder="Optional section subtitle or brief guidance (0 marks)..."
                  className="w-full text-xs text-slate-600 dark:text-slate-400 bg-transparent border-b border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-[#1E293B] dark:focus:border-slate-400 focus:outline-none py-0.5"
                />
              )}
            </div>

            {/* Items in Section */}
            <div className="space-y-4">
              {section.items.map((item, itemIdx) => {
                // 1. Standalone Question
                if (item.kind === 'question') {
                  const q = questionMap.get(item.questionId);
                  if (!q) return null;
                  const globalIdx = questionNumberMap.get(q.id) ?? 0;
                  return (
                    <NativeQuestionCard
                      key={item.id}
                      question={q}
                      index={globalIdx}
                      totalQuestions={questions.length}
                      isActive={activeQuestionId === q.id}
                      onFocus={() => onSelectQuestion(q.id)}
                      onChange={(updated) => onUpdateQuestion(q.id, updated)}
                      onDuplicate={() => onDuplicateQuestion(q.id, section.id)}
                      onDelete={() => onDeleteQuestion(q.id)}
                      onAddAbove={() => handleAddStandaloneQuestion(section.id, itemIdx)}
                      onAddBelow={() => handleAddStandaloneQuestion(section.id, itemIdx + 1)}
                      onMoveUp={() => handleMoveSectionItem(section.id, itemIdx, 'up')}
                      onMoveDown={() => handleMoveSectionItem(section.id, itemIdx, 'down')}
                      canMoveUp={itemIdx > 0}
                      canMoveDown={itemIdx < section.items.length - 1}
                    />
                  );
                }

                // 2. Non-graded Content / Instruction Block
                if (item.kind === 'content') {
                  const isInstruction = item.blockType === 'instruction';
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border ${
                        isInstruction
                          ? 'border-amber-200/90 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/15'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121620]'
                      } p-4 sm:p-5 space-y-3`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/70 dark:border-slate-800">
                        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                          {isInstruction ? (
                            <Info size={14} className="text-amber-700 dark:text-amber-400 shrink-0" />
                          ) : (
                            <FileText size={14} className="text-slate-500 shrink-0" />
                          )}
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {isInstruction ? 'Instruction Block' : 'Text / Note Block'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            Informational only · 0 marks
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateSectionItem(section.id, item.id, (prev) =>
                                  prev.kind === 'content'
                                    ? { ...prev, blockType: 'instruction' }
                                    : prev
                                )
                              }
                              className={`px-2 py-1 rounded-md transition-colors ${
                                isInstruction
                                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              Instruction
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateSectionItem(section.id, item.id, (prev) =>
                                  prev.kind === 'content' ? { ...prev, blockType: 'text' } : prev
                                )
                              }
                              className={`px-2 py-1 rounded-md transition-colors ${
                                !isInstruction
                                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              Text
                            </button>
                          </div>

                          <button
                            type="button"
                            disabled={itemIdx === 0}
                            onClick={() => handleMoveSectionItem(section.id, itemIdx, 'up')}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                            title="Move block up"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={itemIdx === section.items.length - 1}
                            onClick={() => handleMoveSectionItem(section.id, itemIdx, 'down')}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                            title="Move block down"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteContentBlock(section.id, item.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#B91C1C] hover:bg-red-50 dark:hover:bg-red-950/30"
                            title="Delete block"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={item.title || ''}
                        onChange={(e) =>
                          handleUpdateSectionItem(section.id, item.id, (prev) =>
                            prev.kind === 'content' ? { ...prev, title: e.target.value } : prev
                          )
                        }
                        placeholder="Optional heading (e.g. Read carefully before answering)"
                        className="w-full text-sm font-bold text-slate-900 dark:text-white bg-transparent border-b border-slate-200/80 dark:border-slate-700/80 focus:border-[#1E293B] dark:focus:border-slate-400 focus:outline-none py-1"
                      />

                      <AutoGrowTextarea
                        value={item.body}
                        onChange={(nextBody) =>
                          handleUpdateSectionItem(section.id, item.id, (prev) =>
                            prev.kind === 'content' ? { ...prev, body: nextBody } : prev
                          )
                        }
                        placeholder="Write instructions, formulas, context notes, or guidelines for students..."
                        minRows={4}
                        minHeightPx={112}
                        ariaLabel="Instruction or text block body"
                      />
                    </div>
                  );
                }

                // 3. Comprehension Passage Group Container
                if (item.kind === 'comprehension') {
                  const linkedCount = item.questionIds.length;
                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-300/90 dark:border-slate-700 bg-slate-50/70 dark:bg-[#0F141E] p-4 sm:p-5 space-y-4"
                    >
                      {/* Comprehension Group Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                          <BookOpen size={15} className="text-[#B91C1C] dark:text-red-400 shrink-0" />
                          <span className="font-bold text-slate-900 dark:text-white">
                            Comprehension Passage
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {linkedCount} linked {linkedCount === 1 ? 'question' : 'questions'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            Passage carries 0 marks
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={itemIdx === 0}
                            onClick={() => handleMoveSectionItem(section.id, itemIdx, 'up')}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-30"
                            title="Move comprehension group up"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={itemIdx === section.items.length - 1}
                            onClick={() => handleMoveSectionItem(section.id, itemIdx, 'down')}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-30"
                            title="Move comprehension group down"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestDeletePassage(section.id, item)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#B91C1C] hover:bg-red-50 dark:hover:bg-red-950/30"
                            title="Delete comprehension passage"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Passage Title & Body */}
                      <div className="space-y-3 bg-white dark:bg-[#121620] rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                        <input
                          type="text"
                          value={item.title || ''}
                          onChange={(e) =>
                            handleUpdateSectionItem(section.id, item.id, (prev) =>
                              prev.kind === 'comprehension'
                                ? { ...prev, title: e.target.value }
                                : prev
                            )
                          }
                          placeholder="Passage Title (e.g. Passage 1 — The Future of Clean Energy)"
                          className="w-full text-sm sm:text-base font-bold text-slate-900 dark:text-white bg-transparent border-b border-slate-200/80 dark:border-slate-700/80 focus:border-[#1E293B] dark:focus:border-slate-400 focus:outline-none py-1"
                        />
                        <AutoGrowTextarea
                          value={item.body}
                          onChange={(nextBody) =>
                            handleUpdateSectionItem(section.id, item.id, (prev) =>
                              prev.kind === 'comprehension'
                                ? { ...prev, body: nextBody }
                                : prev
                            )
                          }
                          placeholder="Paste or type the full reading passage, case study, or scenario here. Students will see this passage together with every question linked below..."
                          minRows={8}
                          minHeightPx={192}
                          ariaLabel="Comprehension passage body"
                        />
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          When question shuffling is enabled, this passage remains intact and its linked questions shuffle only within this group.
                        </p>
                      </div>

                      {/* Linked Child Questions */}
                      <div className="space-y-3">
                        {item.questionIds.map((qid, childIdx) => {
                          const q = questionMap.get(qid);
                          if (!q) return null;
                          const globalIdx = questionNumberMap.get(q.id) ?? 0;
                          return (
                            <NativeQuestionCard
                              key={q.id}
                              question={q}
                              index={globalIdx}
                              totalQuestions={questions.length}
                              isActive={activeQuestionId === q.id}
                              onFocus={() => onSelectQuestion(q.id)}
                              onChange={(updated) => onUpdateQuestion(q.id, updated)}
                              onDuplicate={() => onDuplicateQuestion(q.id, section.id, item.id)}
                              onDelete={() => onDeleteQuestion(q.id)}
                              onAddAbove={() =>
                                handleAddQuestionToComprehension(section.id, item.id, childIdx)
                              }
                              onAddBelow={() =>
                                handleAddQuestionToComprehension(section.id, item.id, childIdx + 1)
                              }
                              onMoveUp={() =>
                                handleMoveQuestionInComprehension(section.id, item.id, childIdx, 'up')
                              }
                              onMoveDown={() =>
                                handleMoveQuestionInComprehension(
                                  section.id,
                                  item.id,
                                  childIdx,
                                  'down'
                                )
                              }
                              canMoveUp={childIdx > 0}
                              canMoveDown={childIdx < item.questionIds.length - 1}
                              groupContextLabel={
                                item.title?.trim()
                                  ? `Linked to: ${item.title.trim()}`
                                  : 'Linked to Reading Passage'
                              }
                              onUnlinkFromGroup={() =>
                                handleUnlinkQuestionFromComprehension(section.id, item.id, q.id)
                              }
                            />
                          );
                        })}

                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleAddQuestionToComprehension(section.id, item.id)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121620] hover:border-[#B91C1C] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-[#B91C1C] dark:hover:text-red-400 transition-colors"
                          >
                            <Plus size={14} /> Add Question to This Passage
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>

            {/* Per-Section Quick Add Footer when multiple sections exist */}
            {layout.sections.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleAddStandaloneQuestion(section.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:border-[#1E293B] dark:hover:border-slate-400 transition-colors"
                >
                  <Plus size={12} /> Question in Section {sectionIdx + 1}
                </button>
                <button
                  type="button"
                  onClick={() => handleAddComprehensionGroup(section.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:border-[#B91C1C] transition-colors"
                >
                  <BookOpen size={12} /> Passage in Section {sectionIdx + 1}
                </button>
                <button
                  type="button"
                  onClick={() => handleAddContentBlock(section.id, 'instruction')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:border-slate-500 transition-colors"
                >
                  <FileText size={12} /> Text / Instructions
                </button>
              </div>
            )}
          </section>
        );
      })}

      {/* Bottom Add Action Strip */}
      <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={() => handleAddStandaloneQuestion(targetDefaultSectionId)}
          className="px-4 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#B91C1C] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-[#B91C1C] dark:hover:text-red-400 transition-colors inline-flex items-center gap-1.5"
        >
          <Plus size={15} /> Add Question
        </button>
        <button
          type="button"
          onClick={() => handleAddComprehensionGroup(targetDefaultSectionId)}
          className="px-4 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#B91C1C] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-[#B91C1C] dark:hover:text-red-400 transition-colors inline-flex items-center gap-1.5"
        >
          <BookOpen size={15} /> Add Comprehension Passage
        </button>
        <button
          type="button"
          onClick={() => handleAddContentBlock(targetDefaultSectionId, 'instruction')}
          className="px-4 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-500 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors inline-flex items-center gap-1.5"
        >
          <FileText size={15} /> Add Text / Instructions
        </button>
        <button
          type="button"
          onClick={handleAddSection}
          className="px-4 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-500 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors inline-flex items-center gap-1.5"
        >
          <FolderPlus size={15} /> Add Section
        </button>
      </div>

      {/* Safe Delete Confirmation Dialog for Comprehension Passages with Linked Questions */}
      {pendingDeletePassage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-passage-dialog-title"
        >
          <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121620] p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h3
                  id="delete-passage-dialog-title"
                  className="text-base font-bold text-slate-900 dark:text-white"
                >
                  Delete Comprehension Passage?
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  This passage has{' '}
                  <strong className="tabular-nums">
                    {pendingDeletePassage.item.questionIds.length} linked{' '}
                    {pendingDeletePassage.item.questionIds.length === 1 ? 'question' : 'questions'}
                  </strong>
                  . Choose whether to keep those questions as standalone items or delete them together.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleConfirmDeletePassage('unlink')}
                className="w-full px-4 py-2.5 rounded-xl bg-[#1E293B] hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white text-xs font-bold transition-colors text-center"
              >
                Delete Passage &amp; Keep Questions (Unlink)
              </button>
              {canDeleteAllFromPendingPassage && (
                <button
                  type="button"
                  onClick={() => handleConfirmDeletePassage('delete_all')}
                  className="w-full px-4 py-2.5 rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-[#B91C1C] dark:text-red-300 text-xs font-bold transition-colors text-center"
                >
                  Delete Passage &amp; All {pendingDeletePassage.item.questionIds.length} Linked Questions
                </button>
              )}
              <button
                type="button"
                onClick={() => setPendingDeletePassage(null)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
