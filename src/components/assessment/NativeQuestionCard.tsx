import React, { useState } from 'react';
import {
  GripVertical,
  Trash2,
  Copy,
  Plus,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Circle,
  X,
  Link,
  Image,
  FileText,
  AlignLeft,
  CheckSquare,
  HelpCircle,
  MoreVertical,
} from 'lucide-react';

export type QuestionTypeChoice =
  | 'multiple_choice'
  | 'short_answer'
  | 'long_answer'
  | 'link_submission'
  | 'image_submission';

export interface NativeQuestionData {
  id: string;
  prompt: string;
  type: QuestionTypeChoice | string;
  points: number;
  required: boolean;
  options?: Array<{ id: string; text: string }>;
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
  deliverableInstructions?: string;
  acceptedFileTypes?: string;
  maxFileSizeMb?: number;
  expectedDomain?: string;
}

interface NativeQuestionCardProps {
  question: NativeQuestionData;
  index: number;
  totalQuestions: number;
  isActive: boolean;
  onFocus: () => void;
  onChange: (updated: NativeQuestionData) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddAbove: () => void;
  onAddBelow: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export const NativeQuestionCard: React.FC<NativeQuestionCardProps> = ({
  question,
  index,
  totalQuestions,
  isActive,
  onFocus,
  onChange,
  onDuplicate,
  onDelete,
  onAddAbove,
  onAddBelow,
  onMoveUp,
  onMoveDown,
}) => {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Normalize question type to one of the 5 canonical UI types
  const resolvedType: QuestionTypeChoice =
    question.type === 'short_answer'
      ? 'short_answer'
      : question.type === 'long_answer' || question.type === 'essay'
      ? 'long_answer'
      : question.type === 'link_submission'
      ? 'link_submission'
      : question.type === 'file_submission' || question.type === 'image_submission'
      ? 'image_submission'
      : 'multiple_choice';

  const handleTypeChange = (newType: QuestionTypeChoice) => {
    let nextOptions = question.options;
    let nextCorrect = question.correctOptionIds;

    if (newType === 'multiple_choice') {
      if (!nextOptions || nextOptions.length === 0) {
        nextOptions = [
          { id: 'A', text: 'Option 1' },
          { id: 'B', text: 'Option 2' },
          { id: 'C', text: 'Option 3' },
          { id: 'D', text: 'Option 4' },
        ];
        nextCorrect = ['A'];
      }
    }

    onChange({
      ...question,
      type:
        newType === 'image_submission'
          ? 'file_submission'
          : newType === 'long_answer'
          ? 'essay'
          : newType,
      options: nextOptions,
      correctOptionIds: nextCorrect,
    });
  };

  // Multiple Choice Option Handlers
  const handleOptionTextChange = (optIndex: number, newText: string) => {
    const opts = [...(question.options || [])];
    if (opts[optIndex]) {
      opts[optIndex] = { ...opts[optIndex], text: newText };
      onChange({ ...question, options: opts });
    }
  };

  const handleSetCorrectOption = (optId: string) => {
    onChange({
      ...question,
      correctOptionIds: [optId],
    });
  };

  const handleAddOption = () => {
    const opts = [...(question.options || [])];
    const letter = String.fromCharCode(65 + opts.length); // A, B, C, D, E...
    opts.push({ id: letter, text: `Option ${opts.length + 1}` });
    onChange({ ...question, options: opts });
  };

  const handleRemoveOption = (optIndex: number) => {
    const opts = (question.options || []).filter((_, idx) => idx !== optIndex);
    // Re-letter options
    const relettered = opts.map((o, idx) => ({
      id: String.fromCharCode(65 + idx),
      text: o.text,
    }));
    const newCorrect = (question.correctOptionIds || []).filter((cid) =>
      relettered.some((o) => o.id === cid)
    );
    onChange({
      ...question,
      options: relettered,
      correctOptionIds: newCorrect.length > 0 ? newCorrect : [relettered[0]?.id || 'A'],
    });
  };

  return (
    <div
      onClick={onFocus}
      className={`rounded-2xl bg-white dark:bg-[#161B26] border transition-all duration-200 relative ${
        isActive
          ? 'border-blue-600 dark:border-blue-500 shadow-md ring-2 ring-blue-500/10 border-l-[6px] border-l-blue-600'
          : 'border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
      }`}
    >
      {/* Top Handle & Card Header */}
      <div className="pt-2 px-4 flex items-center justify-between text-slate-400">
        <div className="flex items-center gap-2">
          <GripVertical size={16} className="cursor-grab text-slate-400 hover:text-slate-600" />
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Question {index + 1} of {totalQuestions}
          </span>
        </div>

        {/* Quick Position Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            title="Move Question Up"
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 text-slate-500 cursor-pointer"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            disabled={index === totalQuestions - 1}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            title="Move Question Down"
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 text-slate-500 cursor-pointer"
          >
            <ArrowDown size={14} />
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Row 1: Prompt Input + Question Type Selector */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1 w-full">
            <input
              type="text"
              value={question.prompt}
              onChange={(e) => onChange({ ...question, prompt: e.target.value })}
              placeholder="Question title or prompt..."
              className="w-full text-sm sm:text-base font-bold text-slate-900 dark:text-white bg-slate-50/70 dark:bg-slate-900/60 hover:bg-slate-100/70 dark:hover:bg-slate-900/90 focus:bg-white dark:focus:bg-slate-900 px-3.5 py-2.5 rounded-xl border border-transparent focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="w-full sm:w-auto shrink-0">
            <select
              value={resolvedType}
              onChange={(e) => handleTypeChange(e.target.value as QuestionTypeChoice)}
              className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
            >
              <option value="multiple_choice">● Multiple Choice</option>
              <option value="short_answer">▬ Short Answer</option>
              <option value="long_answer">≡ Long Answer</option>
              <option value="link_submission">🔗 Link Submission</option>
              <option value="image_submission">📷 Image Submission</option>
            </select>
          </div>
        </div>

        {/* Dynamic Type Body */}
        <div className="pt-1">
          {/* 1. MULTIPLE CHOICE */}
          {resolvedType === 'multiple_choice' && (
            <div className="space-y-2.5">
              {(question.options || []).map((opt, optIdx) => {
                const isCorrect = (question.correctOptionIds || []).includes(opt.id);
                return (
                  <div key={opt.id} className="flex items-center gap-3 group">
                    <button
                      type="button"
                      onClick={() => handleSetCorrectOption(opt.id)}
                      title={isCorrect ? 'Correct Answer' : 'Click to set as Correct Answer'}
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        isCorrect
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'border-2 border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-transparent hover:text-emerald-500'
                      }`}
                    >
                      {isCorrect ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <span className="text-[10px] font-black">{opt.id}</span>
                      )}
                    </button>

                    <div className="flex-1">
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => handleOptionTextChange(optIdx, e.target.value)}
                        placeholder={`Option ${opt.id}...`}
                        className={`w-full px-3 py-1.5 rounded-lg text-xs sm:text-sm text-slate-800 dark:text-slate-200 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-800 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-all ${
                          isCorrect ? 'font-bold text-emerald-900 dark:text-emerald-300' : ''
                        }`}
                      />
                    </div>

                    {(question.options || []).length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(optIdx)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-1.5 rounded-lg transition-opacity cursor-pointer"
                        title="Remove option"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })}

              <div className="flex items-center gap-2 pt-1 pl-10">
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={13} /> Add Option
                </button>
                <span className="text-[11px] text-slate-400">
                  (Click the letter circle to mark the correct answer)
                </span>
              </div>
            </div>
          )}

          {/* 2. SHORT ANSWER */}
          {resolvedType === 'short_answer' && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
              <div className="p-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 text-xs text-slate-400 italic">
                Student will enter a short text answer...
              </div>

              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Accepted Correct Answer(s) (for automated grading)
                </label>
                <input
                  type="text"
                  value={(question.acceptedAnswers || []).join(', ')}
                  onChange={(e) =>
                    onChange({
                      ...question,
                      acceptedAnswers: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="e.g. Hypertext, HTML, Hyper Text (comma-separated)"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* 3. LONG ANSWER */}
          {resolvedType === 'long_answer' && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
              <div className="p-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 text-xs text-slate-400 italic">
                Student will write a detailed paragraph or essay explanation (requires tutor grading review)...
              </div>

              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Evaluation Guidance / Rubric for Tutors
                </label>
                <textarea
                  rows={2}
                  value={question.deliverableInstructions || ''}
                  onChange={(e) =>
                    onChange({ ...question, deliverableInstructions: e.target.value })
                  }
                  placeholder="Points to look for e.g. clear problem definition, correct terminology, completeness..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* 4. LINK SUBMISSION */}
          {resolvedType === 'link_submission' && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-400">
                <Link size={14} /> Student Deliverable: URL Link Submission
              </div>
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Submission Instructions
                </label>
                <input
                  type="text"
                  value={question.deliverableInstructions || ''}
                  onChange={(e) =>
                    onChange({ ...question, deliverableInstructions: e.target.value })
                  }
                  placeholder="e.g. Paste your live project demo URL, GitHub repository, or Canva presentation link..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* 5. IMAGE SUBMISSION */}
          {resolvedType === 'image_submission' && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <Image size={14} /> Student Deliverable: Image Upload
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Upload Instructions
                  </label>
                  <input
                    type="text"
                    value={question.deliverableInstructions || ''}
                    onChange={(e) =>
                      onChange({ ...question, deliverableInstructions: e.target.value })
                    }
                    placeholder="e.g. Upload a screenshot of your Scratch code or design artwork..."
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Accepted File Types
                  </label>
                  <input
                    type="text"
                    value={question.acceptedFileTypes || 'image/png, image/jpeg, image/webp'}
                    onChange={(e) => onChange({ ...question, acceptedFileTypes: e.target.value })}
                    placeholder="image/png, image/jpeg, application/pdf"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card Footer: Points, Required Toggle, Duplicate, Delete */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Left: Add Above / Below buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddAbove();
              }}
              className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] sm:text-[11px] font-bold cursor-pointer inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Plus size={11} className="shrink-0" /> Add Above
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddBelow();
              }}
              className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] sm:text-[11px] font-bold cursor-pointer inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Plus size={11} className="shrink-0" /> Add Below
            </button>
          </div>

          {/* Right: Points, Required Toggle, Duplicate, Delete */}
          <div className="flex items-center gap-3">
            {/* Points input */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-bold text-slate-500">Points:</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={question.points}
                onChange={(e) =>
                  onChange({ ...question, points: Math.max(0, Number(e.target.value) || 1) })
                }
                className="w-12 text-center text-xs font-black text-slate-900 dark:text-white bg-transparent focus:outline-none"
              />
            </div>

            {/* Required Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Required</span>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onChange({ ...question, required: !question.required });
                }}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                  question.required ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-transform ${
                    question.required ? 'left-4.5' : 'left-0.75'
                  }`}
                />
              </div>
            </label>

            <span className="text-slate-200 dark:text-slate-700">|</span>

            {/* Duplicate */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              title="Duplicate Question"
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Copy size={16} />
            </button>

            {/* Delete with confirmation */}
            {showConfirmDelete ? (
              <div className="flex items-center gap-1 animate-in fade-in">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="px-2 py-1 bg-red-600 text-white text-[11px] font-bold rounded-lg hover:bg-red-700 cursor-pointer"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowConfirmDelete(false);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirmDelete(true);
                }}
                title="Delete Question"
                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
