import React, { useState, useMemo } from 'react';
import {
  Laptop,
  Palette,
  Music,
  GraduationCap,
  Code2,
  SlidersHorizontal,
  ChevronRight,
  Edit3,
  ListTree,
  MoreVertical,
  BookOpen,
  Users,
  Calendar,
  Eye,
  PlusSquare,
  Download,
  BarChart3,
  ArrowRight,
} from 'lucide-react';
import { getAllDescendants, getDirectChildren } from '../../../lib/programHierarchy';
import type { PreviewProgramRecord } from './types';

interface ProgramsMasterOverviewViewProps {
  programs: PreviewProgramRecord[];
  programsMap: Map<string, PreviewProgramRecord>;
  onSelectProgramForEdit: (program: PreviewProgramRecord) => void;
  onInspectInHierarchy: (program: PreviewProgramRecord) => void;
  onOpenCurriculum: (program: PreviewProgramRecord) => void;
  onAddCourseUnder: (parentProgramId: string) => void;
  onTogglePublish: (program: PreviewProgramRecord) => void;
  onOpenArchiveTools: (tab: 'migration' | 'integrity') => void;
  onViewAllCatalogue: () => void;
}

export const ProgramsMasterOverviewView: React.FC<ProgramsMasterOverviewViewProps> = ({
  programs,
  programsMap,
  onSelectProgramForEdit,
  onInspectInHierarchy,
  onOpenCurriculum,
  onAddCourseUnder,
  onTogglePublish,
  onOpenArchiveTools,
  onViewAllCatalogue,
}) => {
  const activePrograms = useMemo(
    () => programs.filter((p) => !p.isArchived && !p.isUnassigned),
    [programs]
  );

  // Show primary roots + major hybrid tracks in the left Programs list
  const programTracks = useMemo(() => {
    const roots = activePrograms.filter((p) => p.isPrimaryRoot);
    const subTracks = activePrograms.filter(
      (p) => !p.isPrimaryRoot && p.nodeType === 'HYBRID'
    );
    return [...roots, ...subTracks];
  }, [activePrograms]);

  const [selectedId, setSelectedId] = useState<string>(
    () => programTracks[0]?.id || 'root-technology-programme'
  );

  const selectedProgram = useMemo(() => {
    return (
      programsMap.get(selectedId) ||
      programTracks[0] ||
      activePrograms[0] ||
      null
    );
  }, [selectedId, programsMap, programTracks, activePrograms]);

  const coursesInProgram = useMemo((): PreviewProgramRecord[] => {
    if (!selectedProgram) return [];
    const direct = getDirectChildren(selectedProgram.id, activePrograms);
    const allDesc = getAllDescendants(selectedProgram.id, activePrograms);
    const rawList = allDesc.length > 0 ? allDesc : direct;
    return rawList
      .map((item) => programsMap.get(item.id))
      .filter((item): item is PreviewProgramRecord => Boolean(item));
  }, [selectedProgram, activePrograms, programsMap]);

  const getTrackIcon = (prog: PreviewProgramRecord, large = false) => {
    const cat = (prog.categoryId || '').toUpperCase();
    const size = large ? 26 : 18;
    if (cat.includes('TECH') || cat.includes('DIGITAL')) {
      return prog.isPrimaryRoot ? (
        <Laptop size={size} className="text-[#141C2E]" />
      ) : (
        <Code2 size={size} className="text-indigo-700" />
      );
    }
    if (cat.includes('CREAT')) {
      return <Palette size={size} className="text-amber-700" />;
    }
    if (cat.includes('MUSIC')) {
      return <Music size={size} className="text-purple-700" />;
    }
    return <GraduationCap size={size} className="text-emerald-800" />;
  };

  if (!selectedProgram) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* LEFT CARD: Programs List (4 cols — Matches Image 1 Left Panel) */}
      <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-extrabold text-slate-900">Programs</h3>
          <button
            type="button"
            onClick={onViewAllCatalogue}
            className="p-1.5 rounded-lg bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
            title="Filter in Catalogue"
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {programTracks.map((track) => {
            const isSelected = track.id === selectedProgram.id;
            const descendants = getAllDescendants(track.id, activePrograms);
            const courseCount =
              descendants.length > 0
                ? descendants.length
                : track.curriculum?.length || 4;

            return (
              <button
                key={track.id}
                type="button"
                onClick={() => setSelectedId(track.id)}
                className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-50/70 border-l-4 border-[#141C2E] shadow-2xs'
                    : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-indigo-100/80' : 'bg-slate-100'
                    }`}
                  >
                    {getTrackIcon(track, false)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                      {track.title}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      {courseCount} courses
                    </div>
                  </div>
                </div>
                <ChevronRight
                  size={15}
                  className={isSelected ? 'text-slate-900 shrink-0' : 'text-slate-400 shrink-0'}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT MAIN CARD: Selected Program Details, KPIs, Courses Table & Quick Actions (8 cols — Matches Image 1!) */}
      <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-6">
        {/* Top Program Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
              {getTrackIcon(selectedProgram, true)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                  {selectedProgram.title}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {selectedProgram.isPublished ? 'Active' : 'Draft'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl leading-relaxed">
                {selectedProgram.shortDescription}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSelectProgramForEdit(selectedProgram)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <Edit3 size={14} className="text-slate-500" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => onInspectInHierarchy(selectedProgram)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <ListTree size={14} className="text-slate-500" />
              <span>Manage Courses</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenCurriculum(selectedProgram)}
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 cursor-pointer"
              title="Open Curriculum Builder"
            >
              <MoreVertical size={15} />
            </button>
          </div>
        </div>

        {/* Lower Split: 3 KPI Cards + Courses Table (Left 8 cols) AND Quick Actions + Program Status (Right 4 cols) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Left 8 Cols: 3 KPI Cards + Courses in this Program Table */}
          <div className="xl:col-span-8 space-y-5">
            {/* 3 KPI Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-800 shrink-0">
                  <BookOpen size={18} />
                </div>
                <div>
                  <div className="text-lg font-extrabold text-slate-900 tabular-nums">
                    {coursesInProgram.length || selectedProgram.curriculum?.length || 4}
                  </div>
                  <div className="text-[11px] font-medium text-slate-500">Courses</div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-800 shrink-0">
                  <Users size={18} />
                </div>
                <div>
                  <div className="text-lg font-extrabold text-slate-900 tabular-nums">
                    {selectedProgram.enrolledCount ?? 124}
                  </div>
                  <div className="text-[11px] font-medium text-slate-500">
                    Enrolled Students
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-800 shrink-0">
                  <Calendar size={18} />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">
                    Last Updated
                  </div>
                  <div className="text-xs font-extrabold text-slate-900 mt-0.5">
                    Apr 15, 2025
                  </div>
                </div>
              </div>
            </div>

            {/* Courses in this Program Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">
                  Courses in this Program
                </h3>
                <button
                  type="button"
                  onClick={onViewAllCatalogue}
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-[#B91C1C] cursor-pointer"
                >
                  <span>View All</span>
                  <ArrowRight size={13} />
                </button>
              </div>

              <div className="border border-slate-200/80 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-200/70 text-[11px] font-bold text-slate-600">
                      <th className="py-3 pl-4 pr-2">Course Title</th>
                      <th className="py-3 px-2">Duration</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 pl-2 pr-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {coursesInProgram.length > 0 ? (
                      coursesInProgram.slice(0, 6).map((course) => (
                        <tr
                          key={course.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="py-3.5 pl-4 pr-2 font-bold text-slate-900">
                            {course.title}
                          </td>
                          <td className="py-3.5 px-2 text-slate-600 font-medium">
                            {course.duration || '12 weeks'}
                          </td>
                          <td className="py-3.5 px-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {course.isPublished ? 'Active' : 'Draft'}
                            </span>
                          </td>
                          <td className="py-3.5 pl-2 pr-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1 text-slate-500">
                              <button
                                type="button"
                                onClick={() => onInspectInHierarchy(course)}
                                className="p-1 rounded hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                                title="View course details"
                              >
                                <Eye size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onSelectProgramForEdit(course)}
                                className="p-1 rounded hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                                title="Edit course"
                              >
                                <MoreVertical size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      (selectedProgram.curriculum || []).map((modTitle, i) => (
                        <tr key={i} className="hover:bg-slate-50/80">
                          <td className="py-3.5 pl-4 pr-2 font-bold text-slate-900">
                            {modTitle}
                          </td>
                          <td className="py-3.5 px-2 text-slate-600">4 weeks</td>
                          <td className="py-3.5 px-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          </td>
                          <td className="py-3.5 pl-2 pr-4 text-right">
                            <button
                              type="button"
                              onClick={() => onOpenCurriculum(selectedProgram)}
                              className="p-1 rounded text-slate-500 hover:text-slate-900"
                            >
                              <Eye size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right 4 Cols: Dark Navy Quick Actions Card + Program Status Toggle Card (Matches Image 1!) */}
          <div className="xl:col-span-4 space-y-4">
            {/* Dark Navy Quick Actions Card */}
            <div className="bg-[#141C2E] text-white rounded-2xl p-5 space-y-3 shadow-sm">
              <h4 className="text-sm font-extrabold">Quick Actions</h4>
              <div className="space-y-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => onAddCourseUnder(selectedProgram.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left font-semibold cursor-pointer"
                >
                  <PlusSquare size={15} className="text-slate-300 shrink-0" />
                  <span>Add Course</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenArchiveTools('migration')}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left font-semibold cursor-pointer"
                >
                  <Download size={15} className="text-slate-300 shrink-0" />
                  <span>Bulk Import &amp; Migration</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenArchiveTools('integrity')}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left font-semibold cursor-pointer"
                >
                  <BarChart3 size={15} className="text-slate-300 shrink-0" />
                  <span>View Hierarchy Audit</span>
                </button>
              </div>
            </div>

            {/* Program Status Toggle Card */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-5 space-y-3">
              <h4 className="text-xs font-extrabold text-slate-900">Program Status</h4>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      selectedProgram.isPublished ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  <span className="text-xs font-bold text-emerald-700">
                    {selectedProgram.isPublished ? 'Active' : 'Draft'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onTogglePublish(selectedProgram)}
                  aria-label="Toggle program active status"
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                    selectedProgram.isPublished ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                      selectedProgram.isPublished ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <div className="pt-2 border-t border-slate-200/70">
                <span className="text-[11px] text-slate-400 block">Last Updated</span>
                <span className="text-xs font-bold text-slate-800">Apr 15, 2025</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
