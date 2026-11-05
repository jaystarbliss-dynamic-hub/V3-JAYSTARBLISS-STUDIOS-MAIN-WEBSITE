import React, { useState, useMemo } from 'react';
import {
  X,
  Upload,
  FileText,
  Sparkles,
  BookOpen,
  Copy,
  Check,
  Download,
  AlertTriangle,
  Search,
  Filter,
  CheckCircle2,
  Layers,
  ArrowRight,
  HelpCircle,
  FolderTree,
  Tag,
} from 'lucide-react';
import { parseExamScript } from '../../modules/examinations/parseExamScript';
import {
  PRIMARY_PROGRAM_ROOTS,
  KNOWN_SUB_PROGRAMMES,
} from '../../lib/programHierarchy';

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'question-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

const SAMPLE_SCRIPT_TEMPLATE = `1. What does HTML stand for in web engineering? [2 marks]
A. Hyper Text Markup Language
B. High Tech Modern Logic
C. Hyperlink Text Making Layout
D. Home Tool Markup Language

2. Which input device is primarily used for typing and keyboarding? [1 mark]
A. Monitor
B. Keyboard
C. Printer
D. Optical Scanner

3. What is the core responsibility of an Operating System? [2 marks]
A. Browse web pages
B. Manage computer hardware and system resources
C. Edit vector illustrations
D. Transmit audio signals

4. In digital graphic design, what does RGB stand for? [2 marks]
A. Real Graphic Bitmap
B. Red, Green, Blue
C. Raster Grid Base
D. Resolution Grain Blend

5. Which keyboard shortcut is universally used to save a file? [1 mark]
A. Ctrl + C
B. Ctrl + V
C. Ctrl + S
D. Ctrl + P

ANSWER KEY
1. A
2. B
3. B
4. B
5. C`;

export interface QuestionBankItem {
  id: string;
  prompt: string;
  type: string;
  options?: Array<{ id: string; text: string }>;
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
  points: number;
  subject?: string;
  programTitle?: string;
  programId?: string;
  programPath?: string;
  breadcrumbPath?: string;
  category?: string;
  primaryCategory?: string;
}

interface ImportQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportQuestions: (questions: any[]) => void;
  questionBankItems?: QuestionBankItem[];
  defaultPointValue?: number;
}

export const ImportQuestionsModal: React.FC<ImportQuestionsModalProps> = ({
  isOpen,
  onClose,
  onImportQuestions,
  questionBankItems = [],
  defaultPointValue = 2,
}) => {
  const [activeTab, setActiveTab] = useState<'text' | 'csv' | 'bank'>('text');

  // Text Parser State
  const [rawText, setRawText] = useState(SAMPLE_SCRIPT_TEMPLATE);
  const [parsedTextQuestions, setParsedTextQuestions] = useState<any[]>([]);
  const [textWarnings, setTextWarnings] = useState<string[]>([]);
  const [hasCopiedSample, setHasCopiedSample] = useState(false);

  // CSV Import State
  const [parsedCsvQuestions, setParsedCsvQuestions] = useState<any[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);

  // Question Bank State with Recursive Hierarchy Integration
  const [bankSearch, setBankSearch] = useState('');
  const [bankCategoryFilter, setBankCategoryFilter] = useState('ALL');
  const [bankSubjectFilter, setBankSubjectFilter] = useState('ALL');
  const [bankProgramFilter, setBankProgramFilter] = useState('ALL');
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());

  // Distinct subjects and programs from question bank
  const bankSubjects = useMemo(() => {
    const set = new Set<string>();
    questionBankItems.forEach((q) => {
      if (q.subject) set.add(q.subject);
    });
    return Array.from(set).sort();
  }, [questionBankItems]);

  const bankPrograms = useMemo(() => {
    const set = new Set<string>();
    questionBankItems.forEach((q) => {
      if (q.programTitle) set.add(q.programTitle);
      else if (q.category) set.add(q.category);
    });
    return Array.from(set).sort();
  }, [questionBankItems]);

  // Filtered Question Bank supporting primary categories, sub-programmes, subjects & search
  const filteredBankQuestions = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    return questionBankItems.filter((item) => {
      if (q && !item.prompt.toLowerCase().includes(q)) return false;
      if (bankSubjectFilter !== 'ALL' && item.subject !== bankSubjectFilter) return false;
      if (
        bankProgramFilter !== 'ALL' &&
        item.programTitle !== bankProgramFilter &&
        item.category !== bankProgramFilter
      )
        return false;

      // Primary Category Filter (Technology, Design & Graphics, Music, Academics)
      if (bankCategoryFilter !== 'ALL') {
        const rootDef = PRIMARY_PROGRAM_ROOTS.find((r) => r.key === bankCategoryFilter);
        const itemText = [
          item.primaryCategory || '',
          item.programTitle || '',
          item.category || '',
          item.subject || '',
          item.breadcrumbPath || '',
          item.programPath || '',
        ]
          .join(' ')
          .toLowerCase();

        if (rootDef) {
          const matchRoot =
            itemText.includes(rootDef.key.toLowerCase()) ||
            itemText.includes(rootDef.title.toLowerCase()) ||
            rootDef.matchAliases.some((alias) => itemText.includes(alias.toLowerCase()));

          // Also check known sub-programmes belonging to this root
          const subDefs = KNOWN_SUB_PROGRAMMES.filter((s) => s.parentRootKey === rootDef.key);
          const matchSub = subDefs.some(
            (s) =>
              itemText.includes(s.title.toLowerCase()) ||
              s.matchAliases.some((alias) => itemText.includes(alias.toLowerCase()))
          );

          if (!matchRoot && !matchSub) return false;
        }
      }

      return true;
    });
  }, [
    questionBankItems,
    bankSearch,
    bankCategoryFilter,
    bankSubjectFilter,
    bankProgramFilter,
  ]);

  if (!isOpen) return null;

  // Handle Text Script Parse
  const handleParseScript = () => {
    setTextWarnings([]);
    if (!rawText.trim()) {
      setTextWarnings(['Please paste or enter formatted question text.']);
      return;
    }
    try {
      const parsed = parseExamScript(rawText, defaultPointValue);
      if (parsed.length === 0) {
        setTextWarnings([
          'No valid numbered questions were detected. Please ensure questions are numbered (e.g. "1. Question text") followed by options A, B, C, D.',
        ]);
        setParsedTextQuestions([]);
        return;
      }

      // Check if any question lacks a correct option
      const withoutAnswers = parsed.filter(
        (q) =>
          (q.type === 'single_choice' || q.type === 'multiple_choice') &&
          (!q.correctOptionIds || q.correctOptionIds.length === 0)
      );
      if (withoutAnswers.length > 0) {
        setTextWarnings([
          `${withoutAnswers.length} question(s) do not have a defined answer key. Include an "ANSWER KEY" section at the end (e.g. "1. A") or assign keys after importing.`,
        ]);
      }

      setParsedTextQuestions(parsed);
    } catch (err: any) {
      setTextWarnings([err.message || 'Error parsing question script.']);
      setParsedTextQuestions([]);
    }
  };

  const copySampleFormat = () => {
    navigator.clipboard.writeText(SAMPLE_SCRIPT_TEMPLATE);
    setHasCopiedSample(true);
    setTimeout(() => setHasCopiedSample(false), 2000);
  };

  // Download Sample CSV
  const handleDownloadSampleCsv = () => {
    const csvContent =
      'Question,Option A,Option B,Option C,Option D,Correct,Points\n' +
      '"What does HTML stand for?","Hyper Text Markup Language","High Tech Modern Logic","Hyperlink Text Making Layout","Home Tool Markup Language","A",2\n' +
      '"Which device is primarily used for typing?","Monitor","Keyboard","Printer","Speaker","B",1\n' +
      '"What is the primary role of an Operating System?","Browse Web Pages","Manage Hardware & Software Resources","Edit Digital Photos","Play Audio Files","B",2\n' +
      '"What does RGB stand for in digital imaging?","Real Graphic Bitmap","Red Green Blue","Raster Grid Base","Resolution Grain Blend","B",2\n' +
      '"Which shortcut is used to save a file?","Ctrl + C","Ctrl + V","Ctrl + S","Ctrl + P","C",1\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jaystarbliss_mcq_import_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle CSV File Upload
  const handleCsvUpload = (file: File) => {
    setCsvFileName(file.name);
    setCsvWarnings([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) return;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length <= 1) {
          setCsvWarnings(['The uploaded CSV is empty or only contains a header row.']);
          setParsedCsvQuestions([]);
          return;
        }

        const questions: any[] = [];
        const rows = lines.slice(1);
        for (let i = 0; i < rows.length; i++) {
          // Simple CSV splitter respecting quotes
          const match = rows[i].match(/(?:\"[^\"]*\"|[^,])+/g);
          if (!match || match.length < 2) continue;
          const cleaned = match.map((c) => c.replace(/^"|"$/g, '').trim());

          const prompt = cleaned[0] || `Imported Question ${i + 1}`;
          const optA = cleaned[1] || 'Option A';
          const optB = cleaned[2] || 'Option B';
          const optC = cleaned[3] || 'Option C';
          const optD = cleaned[4] || 'Option D';
          const correctKey = (cleaned[5] || 'A').toUpperCase().replace(/[^A-D]/g, '') || 'A';
          const pts = Number(cleaned[6]) || defaultPointValue;

          questions.push({
            id: makeId(),
            prompt,
            type: 'single_choice',
            options: [
              { id: 'A', text: optA },
              { id: 'B', text: optB },
              { id: 'C', text: optC },
              { id: 'D', text: optD },
            ],
            correctOptionIds: [correctKey],
            points: Math.max(0.5, pts),
            required: true,
          });
        }

        if (questions.length === 0) {
          setCsvWarnings(['No valid questions could be parsed from this CSV.']);
          setParsedCsvQuestions([]);
        } else {
          setParsedCsvQuestions(questions);
        }
      } catch (err: any) {
        setCsvWarnings([err.message || 'Failed to parse CSV file.']);
        setParsedCsvQuestions([]);
      }
    };
    reader.readAsText(file);
  };

  // Toggle bank item selection
  const toggleBankItem = (id: string) => {
    setSelectedBankIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllBankItems = () => {
    setSelectedBankIds((prev) => {
      const next = new Set(prev);
      filteredBankQuestions.forEach((q) => next.add(q.id));
      return next;
    });
  };

  // Confirm Import
  const handleFinalImport = () => {
    if (activeTab === 'text') {
      if (parsedTextQuestions.length > 0) {
        onImportQuestions(parsedTextQuestions);
        onClose();
      }
    } else if (activeTab === 'csv') {
      if (parsedCsvQuestions.length > 0) {
        onImportQuestions(parsedCsvQuestions);
        onClose();
      }
    } else if (activeTab === 'bank') {
      const toAdd = questionBankItems.filter((q) => selectedBankIds.has(q.id));
      if (toAdd.length > 0) {
        onImportQuestions(toAdd);
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/60 dark:to-[#161B26]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Upload size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                Import Questions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Quickly add questions via formatted script, structured CSV/Excel, or existing Question Bank.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Method Switcher Tabs */}
        <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-200/60 dark:bg-slate-800/80 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'text'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText size={14} />
              <span className="truncate">Parse from Text</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('csv')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'csv'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Upload size={14} />
              <span className="truncate">Excel / CSV File</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bank')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'bank'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BookOpen size={14} />
              <span className="truncate">Question Bank</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* METHOD A: TEXT PARSER */}
          {activeTab === 'text' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                  <strong>Question parsing and CSV/Excel importing currently support Multiple Choice Questions (MCQs) only.</strong>{' '}
                  Numbered questions (1, 2, 3...) with option letters (A, B, C, D) and an optional ANSWER KEY block will be automatically converted into native quiz units.
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Question Text Area
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copySampleFormat}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    {hasCopiedSample ? <Check size={13} /> : <Copy size={13} />}
                    {hasCopiedSample ? 'Copied Sample!' : 'Copy Sample Format'}
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <button
                    type="button"
                    onClick={() => setRawText(SAMPLE_SCRIPT_TEMPLATE)}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                  >
                    Reset Sample
                  </button>
                </div>
              </div>

              <textarea
                rows={10}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste formatted questions here..."
                className="w-full font-mono text-xs p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 leading-relaxed"
              />

              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleParseScript}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Sparkles size={14} /> Parse Questions
                </button>
                {parsedTextQuestions.length > 0 && (
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={14} /> {parsedTextQuestions.length} MCQ Question(s) Parsed & Ready
                  </span>
                )}
              </div>

              {textWarnings.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  {textWarnings.map((w, idx) => (
                    <p key={idx}>• {w}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* METHOD B: CSV / EXCEL UPLOAD */}
          {activeTab === 'csv' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                  <strong>Question parsing and CSV/Excel importing currently support Multiple Choice Questions (MCQs) only.</strong>{' '}
                  Format your spreadsheet columns as instructed below.
                </div>
              </div>

              {/* Explanatory column guide */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Required Column Order
                  </span>
                  <button
                    type="button"
                    onClick={handleDownloadSampleCsv}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Download size={13} /> Download Sample CSV Template
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <strong>1. Question</strong> (text)
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <strong>2. Option A</strong>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <strong>3. Option B</strong>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <strong>4. Option C</strong>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <strong>5. Option D</strong>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <strong>6. Correct</strong> (A, B, C, D)
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <strong>7. Points</strong> (e.g. 2)
                  </div>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div className="p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl text-center space-y-3 bg-white dark:bg-slate-900/60">
                <Upload size={36} className="mx-auto text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-sm font-black text-slate-800 dark:text-white">
                    Choose a CSV Question File
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Select a comma-separated values (.csv) file formatted according to the template above.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs">
                  <span>Browse .CSV File</span>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCsvUpload(file);
                    }}
                  />
                </label>
                {csvFileName && (
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Uploaded: {csvFileName}
                  </p>
                )}
              </div>

              {parsedCsvQuestions.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    ✓ Successfully parsed {parsedCsvQuestions.length} MCQ questions from file!
                  </span>
                </div>
              )}

              {csvWarnings.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  {csvWarnings.map((w, idx) => (
                    <p key={idx}>• {w}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* METHOD C: QUESTION BANK */}
          {activeTab === 'bank' && (
            <div className="space-y-3">
              {/* 4 Primary Programme Categories Quick Filters */}
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">
                  Browse by Primary Programme Category:
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setBankCategoryFilter('ALL');
                      setBankProgramFilter('ALL');
                    }}
                    className={`px-2.5 py-1.5 rounded-xl whitespace-nowrap shrink-0 transition-colors ${
                      bankCategoryFilter === 'ALL'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    All 4 Categories
                  </button>
                  {PRIMARY_PROGRAM_ROOTS.map((root) => (
                    <button
                      key={root.key}
                      type="button"
                      onClick={() => {
                        setBankCategoryFilter(root.key);
                        setBankProgramFilter('ALL');
                      }}
                      className={`px-2.5 py-1.5 rounded-xl whitespace-nowrap shrink-0 transition-colors ${
                        bankCategoryFilter === root.key
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {root.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter Row: Search, Subject, Sub-programme */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={bankSearch}
                    onChange={(e) => setBankSearch(e.target.value)}
                    placeholder="Search bank questions by keyword..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <select
                    value={bankSubjectFilter}
                    onChange={(e) => setBankSubjectFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="ALL">All Subjects</option>
                    {bankSubjects.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={bankProgramFilter}
                    onChange={(e) => setBankProgramFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="ALL">All Specific Sub-Programmes</option>
                    {bankPrograms.map((prg) => (
                      <option key={prg} value={prg}>
                        {prg}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selection Summary */}
              <div className="flex items-center justify-between px-1 text-xs">
                <span className="text-slate-500">
                  Showing {filteredBankQuestions.length} of {questionBankItems.length} questions in bank
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllBankItems}
                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    Select Visible
                  </button>
                  {selectedBankIds.size > 0 && (
                    <>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={() => setSelectedBankIds(new Set())}
                        className="text-red-600 font-bold hover:underline cursor-pointer"
                      >
                        Clear Selection ({selectedBankIds.size})
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Question list */}
              {filteredBankQuestions.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl text-center space-y-2">
                  <BookOpen size={28} className="mx-auto text-slate-400" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    No matching questions found in the Question Bank.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Try adjusting your search keyword, subject, or programme filter.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {filteredBankQuestions.map((item) => {
                    const isSelected = selectedBankIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleBankItem(item.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-300 dark:bg-blue-950/40 dark:border-blue-700 shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {item.type.replace('_', ' ')}
                            </span>
                            {item.subject && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                                {item.subject}
                              </span>
                            )}
                            {(item.breadcrumbPath || item.programTitle) && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 inline-flex items-center gap-1 max-w-[220px] truncate">
                                <Tag size={9} className="shrink-0" />
                                <span className="truncate">{item.breadcrumbPath || item.programTitle}</span>
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-slate-400">
                              {item.points} Mark(s)
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {item.prompt}
                          </p>
                          {item.options && item.options.length > 0 && (
                            <div className="grid grid-cols-2 gap-1 pt-1 text-[11px] text-slate-500">
                              {item.options.map((o) => (
                                <span key={o.id} className="truncate">
                                  <strong>{o.id}:</strong> {o.text}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div
                          className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border transition-colors mt-1 ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800'
                          }`}
                        >
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {activeTab === 'text' && `${parsedTextQuestions.length} question(s) parsed`}
            {activeTab === 'csv' && `${parsedCsvQuestions.length} question(s) parsed`}
            {activeTab === 'bank' && `${selectedBankIds.size} question(s) selected`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                (activeTab === 'text' && parsedTextQuestions.length === 0) ||
                (activeTab === 'csv' && parsedCsvQuestions.length === 0) ||
                (activeTab === 'bank' && selectedBankIds.size === 0)
              }
              onClick={handleFinalImport}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <Check size={14} />
              Add Questions to Assessment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
