import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  Plus, Search, Trash2, Edit, Layers, ArrowUp, ArrowDown, 
  Check, X, Loader2, BookOpen, CheckCircle2, 
  HelpCircle, Shuffle, ChevronRight, GraduationCap, GripVertical,
  Package, Tag
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';

const CATEGORY_LABELS: Record<string, string> = {
  ACADEMICS: 'Academics',
  DIGITAL_AND_TECHNOLOGY: 'Digital & Tech',
  CREATIVE: 'Creative',
  MUSIC: 'Music',
  EXAM_PREPARATION: 'Exam Prep',
  PERSONALIZED_LEARNING: 'Personalized',
  SCHOOL_PROGRAMS: 'School Programs'
};

interface ProgramItem {
  id: string;
  title: string;
  slug?: string;
  categoryId?: string;
  status?: string;
  seriesName?: string;
  programPack?: string;
  stageNumber?: number;
  stageName?: string;
  hasEdclub?: boolean;
  isGeneralProgram?: boolean;
  hasResources?: boolean;
  curriculum?: string[];
  [key: string]: any;
}

const AdminPrograms: React.FC = () => {
  const { toast } = useToast();
  const [programs, setPrograms] = useState<ProgramItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Multi-selection state for combining into series
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Series & Stage Builder Modal
  const [isSeriesModalOpen, setIsSeriesModalOpen] = useState(false);
  const [seriesName, setSeriesName] = useState('');
  const [programPackName, setProgramPackName] = useState('');
  const [seriesItems, setSeriesItems] = useState<Array<{
    id: string;
    title: string;
    stageNumber: number;
    stageName: string;
  }>>([]);
  const [savingSeries, setSavingSeries] = useState(false);

  // Drag-and-Drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const fetchPrograms = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'programs'));
      const programsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProgramItem));
      // Sort by series, stage number, then title
      programsData.sort((a, b) => {
        if (a.seriesName && b.seriesName && a.seriesName !== b.seriesName) {
          return a.seriesName.localeCompare(b.seriesName);
        }
        if (a.stageNumber && b.stageNumber && a.stageNumber !== b.stageNumber) {
          return a.stageNumber - b.stageNumber;
        }
        return (a.title || '').localeCompare(b.title || '');
      });
      setPrograms(programsData);
    } catch (error) {
      console.error('Error fetching programs:', error);
      toast.error('Failed to load programs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPrograms();
  }, []);

  const handleDelete = async (id: string, title: string) => {
    if (window.confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) {
      try {
        await deleteDoc(doc(db, 'programs', id));
        setPrograms(prev => prev.filter(p => p.id !== id));
        setSelectedIds(prev => prev.filter(item => item !== id));
        toast.success(`Deleted ${title}.`);
      } catch (error) {
        console.error('Error deleting program:', error);
        toast.error('Failed to delete program.');
      }
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredPrograms.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPrograms.map(p => p.id));
    }
  };

  // Open Series & Stage Organizer Modal
  const openSeriesBuilder = () => {
    const targetItems = selectedIds.length > 0 
      ? programs.filter(p => selectedIds.includes(p.id))
      : programs;

    if (targetItems.length === 0) {
      toast.info('Please create or select programs to arrange into a series.');
      return;
    }

    // Determine initial series/pack name if existing
    const firstWithSeries = targetItems.find(p => p.seriesName || p.programPack);
    const initialName = firstWithSeries?.seriesName || firstWithSeries?.programPack || 'Junior Software & Robotics Engineering Series';
    setSeriesName(initialName);
    setProgramPackName(firstWithSeries?.programPack || initialName);

    // Prepare ordered items
    const initialOrdered = targetItems.map((p, idx) => ({
      id: p.id,
      title: p.title || 'Untitled Program',
      stageNumber: p.stageNumber || idx + 1,
      stageName: p.stageName || (p.title ? `Stage ${idx + 1}: ${p.title}` : `Stage ${idx + 1}`)
    }));

    // Sort by existing stageNumber
    initialOrdered.sort((a, b) => a.stageNumber - b.stageNumber);
    // Re-index cleanly 1..N
    const reindexed = initialOrdered.map((item, idx) => ({
      ...item,
      stageNumber: idx + 1,
      stageName: item.stageName || `Stage ${idx + 1}: ${item.title}`
    }));

    setSeriesItems(reindexed);
    setDraggedIndex(null);
    setDragOverIndex(null);
    setIsSeriesModalOpen(true);
  };

  // Drag and Drop reordering logic
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    // Keep subtle hover
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    setSeriesItems(prev => {
      const items = [...prev];
      const [movedItem] = items.splice(draggedIndex, 1);
      items.splice(targetIndex, 0, movedItem);

      return items.map((item, idx) => ({
        ...item,
        stageNumber: idx + 1,
        stageName: item.stageName.startsWith('Stage ') ? `Stage ${idx + 1}: ${item.title}` : item.stageName
      }));
    });

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Move item up in series
  const moveItemUp = (index: number) => {
    if (index <= 0) return;
    setSeriesItems(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return next.map((item, idx) => ({
        ...item,
        stageNumber: idx + 1,
        stageName: item.stageName.startsWith('Stage ') ? `Stage ${idx + 1}: ${item.title}` : item.stageName
      }));
    });
  };

  // Move item down in series
  const moveItemDown = (index: number) => {
    if (index >= seriesItems.length - 1) return;
    setSeriesItems(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return next.map((item, idx) => ({
        ...item,
        stageNumber: idx + 1,
        stageName: item.stageName.startsWith('Stage ') ? `Stage ${idx + 1}: ${item.title}` : item.stageName
      }));
    });
  };

  // Save Series & Stage arrangement to Firestore in batch
  const handleSaveSeries = async () => {
    const finalSeriesName = (seriesName.trim() || programPackName.trim());
    if (!finalSeriesName) {
      return toast.error('Please enter a name for the series / program pack.');
    }
    setSavingSeries(true);
    try {
      const batch = writeBatch(db);
      seriesItems.forEach((item, idx) => {
        const nextStageNum = idx + 1;
        const nextProgram = seriesItems[idx + 1]?.title || '';
        
        batch.update(doc(db, 'programs', item.id), {
          seriesName: finalSeriesName,
          programPack: programPackName.trim() || finalSeriesName,
          stageNumber: nextStageNum,
          stageName: item.stageName.trim() || `Stage ${nextStageNum}: ${item.title}`,
          nextProgramTitle: nextProgram,
          updatedAt: new Date().toISOString()
        });
      });

      await batch.commit();
      toast.success(`Successfully updated ${seriesItems.length} programs in program pack "${finalSeriesName}".`);
      setIsSeriesModalOpen(false);
      setSelectedIds([]);
      await fetchPrograms();
    } catch (err) {
      console.error('Error saving series stages:', err);
      toast.error('Unable to save series stages.');
    } finally {
      setSavingSeries(false);
    }
  };

  const filteredPrograms = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return programs.filter(p => {
      if (categoryFilter !== 'ALL' && p.categoryId !== categoryFilter) return false;
      if (!q) return true;
      return (
        (p.title || '').toLowerCase().includes(q) ||
        (p.slug || '').toLowerCase().includes(q) ||
        (p.seriesName || '').toLowerCase().includes(q) ||
        (p.stageName || '').toLowerCase().includes(q)
      );
    });
  }, [programs, searchQuery, categoryFilter]);

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="bg-white dark:bg-[#0c1220] rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Design learning tracks, reorder stages sequentially, and combine programs into series.</span>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={openSeriesBuilder}
            className="min-h-11 px-4 py-2.5 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-black inline-flex items-center gap-2 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all shadow-xs cursor-pointer"
          >
            <Layers size={15} />
            <span>
              {selectedIds.length > 0 
                ? `Combine Selected (${selectedIds.length}) into Series` 
                : 'Arrange Stages & Series'}
            </span>
          </button>

          <Link 
            to="/admin/programs/new" 
            className="min-h-11 flex items-center gap-2 bg-brand-red text-white px-5 py-2.5 rounded-2xl text-xs font-black hover:bg-red-700 transition-all whitespace-nowrap shadow-sm active:scale-95"
          >
            <Plus size={16} />
            <span>Add Program</span>
          </Link>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="bg-white dark:bg-[#0c1220] rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search programs by title, slug, series..." 
            className="pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-red w-full bg-slate-50 dark:bg-slate-900 dark:text-white font-medium"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Programs Table */}
      <div className="bg-white dark:bg-[#0c1220] rounded-3xl shadow-sm border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800/80">
            <thead className="bg-slate-50/80 dark:bg-slate-950/60">
              <tr>
                <th scope="col" className="px-5 py-3.5 text-left w-10">
                  <input
                    type="checkbox"
                    checked={filteredPrograms.length > 0 && selectedIds.length === filteredPrograms.length}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-brand-red focus:ring-brand-red"
                  />
                </th>
                <th scope="col" className="px-4 py-3.5 text-left text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Stage &amp; Program Track
                </th>
                <th scope="col" className="px-4 py-3.5 text-left text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Series / Curriculum Group
                </th>
                <th scope="col" className="px-4 py-3.5 text-left text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Category
                </th>
                <th scope="col" className="px-4 py-3.5 text-left text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-5 py-3.5 text-right text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-[#0c1220]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 className="animate-spin inline-block mr-2" size={18} /> Loading curriculum programs...
                  </td>
                </tr>
              ) : filteredPrograms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-gray-500 dark:text-gray-400">
                    No programs found matching filters. Click &quot;Add Program&quot; to build a new course.
                  </td>
                </tr>
              ) : (
                filteredPrograms.map((program) => {
                  const isSelected = selectedIds.includes(program.id);
                  const stageNum = program.stageNumber || 1;

                  return (
                    <tr 
                      key={program.id} 
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="px-5 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(program.id)}
                          className="rounded border-slate-300 text-brand-red focus:ring-brand-red"
                        />
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-red-50 dark:bg-red-950/40 text-brand-red border border-red-100 dark:border-red-900/30 shrink-0">
                            Stage {stageNum}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-gray-900 dark:text-white">
                              {program.title}
                            </div>
                            {program.stageName && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {program.stageName}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {program.hasEdclub && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-black border border-indigo-200 dark:border-indigo-800">
                                  EdClub
                                </span>
                              )}
                              {program.isGeneralProgram && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px] font-black border border-amber-200 dark:border-amber-800">
                                  General School Track
                                </span>
                              )}
                              {program.hasResources !== false && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-black border border-emerald-200 dark:border-emerald-800">
                                  Resources
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        {program.seriesName ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            <Layers size={13} /> {program.seriesName}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">Standalone Course</span>
                        )}
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          {CATEGORY_LABELS[program.categoryId || ''] || program.categoryId || 'General Track'}
                        </span>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 inline-flex text-[10px] font-black rounded-full uppercase ${
                          program.status === 'PUBLISHED' 
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {program.status || 'DRAFT'}
                        </span>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <Link 
                            to={`/admin/programs/${program.id}`} 
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-brand-red dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" 
                            title="Edit program details"
                          >
                            <Edit size={14} />
                          </Link>
                          <button 
                            type="button"
                            onClick={() => handleDelete(program.id, program.title)} 
                            className="p-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer" 
                            title="Delete program"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🚀 MODAL: COMBINE INTO SERIES & STAGE REORDERING BUILDER */}
      {isSeriesModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#0c1220] rounded-3xl p-6 sm:p-7 max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 max-h-[88dvh] flex flex-col text-slate-900 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                    <Layers size={18} />
                  </span>
                  <h3 className="font-black text-slate-900 dark:text-white text-lg tracking-tight">
                    Curriculum Series &amp; Program Pack Organizer
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Drag and drop or click ▲ / ▼ to reorder stages sequentially (Stage 1, Stage 2, Stage 3). Group programs into named packs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSeriesModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Package size={13} className="text-brand-red" />
                    1. Program Pack / Series Name:
                  </label>
                  <span className="text-[10px] text-slate-400">Pack identifier for students &amp; schools</span>
                </div>
                <input
                  type="text"
                  value={seriesName}
                  onChange={e => {
                    setSeriesName(e.target.value);
                    setProgramPackName(e.target.value);
                  }}
                  placeholder="e.g. Junior Web & Robotics Engineering Series"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red"
                  required
                />
                
                {/* Quick Presets */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400">Quick Presets:</span>
                  {[
                    'Junior Developers Pack',
                    'Full-Stack Web & AI Pack',
                    'Early Explorers Coding Pack',
                    'Robotics & Embedded Track',
                    'Digital Literacy Foundation Pack'
                  ].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setSeriesName(preset);
                        setProgramPackName(preset);
                      }}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Layers size={13} className="text-indigo-500" />
                    2. Sequential Stage Order ({seriesItems.length} Programs):
                  </label>
                  <span className="text-[10px] text-indigo-500 font-bold">
                    🖐 Drag cards or use buttons to reorder
                  </span>
                </div>

                <div className="space-y-2.5">
                  {seriesItems.map((item, index) => {
                    const isDragging = draggedIndex === index;
                    const isOver = dragOverIndex === index;

                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`p-3.5 rounded-2xl border transition-all select-none cursor-grab active:cursor-grabbing flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs ${
                          isDragging
                            ? 'opacity-40 border-dashed border-indigo-400 bg-indigo-50/20 dark:bg-indigo-950/20 scale-[0.98]'
                            : isOver
                            ? 'border-2 border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/60 ring-2 ring-indigo-400/30'
                            : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab shrink-0">
                            <GripVertical size={16} />
                          </div>

                          <span className="w-8 h-8 rounded-xl bg-brand-red text-white flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
                            {index + 1}
                          </span>

                          <div className="min-w-0 flex-1 space-y-1">
                            <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">
                              {item.title}
                            </h4>
                            <input
                              type="text"
                              value={item.stageName}
                              onChange={e => {
                                const val = e.target.value;
                                setSeriesItems(prev => prev.map((it, idx) => idx === index ? { ...it, stageName: val } : it));
                              }}
                              placeholder={`Stage ${index + 1} Label`}
                              className="w-full px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveItemUp(index)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Move earlier in series (Stage -1)"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={index === seriesItems.length - 1}
                            onClick={() => moveItemDown(index)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Move later in series (Stage +1)"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSeriesItems(prev => prev.filter((_, i) => i !== index))}
                            className="p-1.5 rounded-lg border border-red-200 dark:border-red-900/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer ml-1"
                            title="Remove from series"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setIsSeriesModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingSeries || seriesItems.length === 0}
                onClick={handleSaveSeries}
                className="px-5 py-2 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {savingSeries ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span>Save Program Pack &amp; Stages</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPrograms;
