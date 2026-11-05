import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  School,
  User,
  Users,
  CheckCircle2,
  Check,
  Building2,
  GraduationCap,
  Sparkles,
} from 'lucide-react';

export interface RecipientSchool {
  id: string;
  name: string;
  schoolCode?: string;
  studentCount?: number;
}

export interface RecipientPrivateStudent {
  id: string;
  fullName: string;
  class?: string;
  className?: string;
  schoolId?: string;
  schoolName?: string;
  parentName?: string;
  email?: string;
}

interface RecipientSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selection: {
    targetSchoolIds: string[];
    targetStudentIds: string[];
    recipientMode: 'SCHOOL_CLASS' | 'PRIVATE_LEARNERS' | 'MULTI_TARGET';
  }) => void;
  availableSchools: RecipientSchool[];
  availablePrivateStudents: RecipientPrivateStudent[];
  initialSelectedSchoolIds?: string[];
  initialSelectedStudentIds?: string[];
  isTutor?: boolean;
}

export const RecipientSelectorModal: React.FC<RecipientSelectorModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  availableSchools,
  availablePrivateStudents,
  initialSelectedSchoolIds = [],
  initialSelectedStudentIds = [],
  isTutor = false,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'schools' | 'private'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<Set<string>>(
    new Set(initialSelectedSchoolIds)
  );
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(
    new Set(initialSelectedStudentIds)
  );

  // Sync state if initial selections change or modal opens
  React.useEffect(() => {
    setSelectedSchoolIds(new Set(initialSelectedSchoolIds));
    setSelectedStudentIds(new Set(initialSelectedStudentIds));
  }, [initialSelectedSchoolIds, initialSelectedStudentIds, isOpen]);

  // Filtered Schools
  const filteredSchools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return availableSchools.filter((s) => {
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.schoolCode && s.schoolCode.toLowerCase().includes(q))
      );
    });
  }, [availableSchools, searchQuery]);

  // Filtered Private Students
  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return availablePrivateStudents.filter((st) => {
      if (!q) return true;
      return (
        st.fullName.toLowerCase().includes(q) ||
        (st.parentName && st.parentName.toLowerCase().includes(q)) ||
        (st.className && st.className.toLowerCase().includes(q)) ||
        (st.email && st.email.toLowerCase().includes(q))
      );
    });
  }, [availablePrivateStudents, searchQuery]);

  if (!isOpen) return null;

  const totalSelectedCount = selectedSchoolIds.size + selectedStudentIds.size;

  const toggleSchool = (id: string) => {
    setSelectedSchoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    if (activeTab === 'all' || activeTab === 'schools') {
      setSelectedSchoolIds((prev) => {
        const next = new Set(prev);
        filteredSchools.forEach((s) => next.add(s.id));
        return next;
      });
    }
    if (activeTab === 'all' || activeTab === 'private') {
      setSelectedStudentIds((prev) => {
        const next = new Set(prev);
        filteredStudents.forEach((st) => next.add(st.id));
        return next;
      });
    }
  };

  const clearAllSelected = () => {
    setSelectedSchoolIds(new Set());
    setSelectedStudentIds(new Set());
  };

  const handleConfirm = () => {
    const schoolsArr = Array.from(selectedSchoolIds);
    const studentsArr = Array.from(selectedStudentIds);
    let mode: 'SCHOOL_CLASS' | 'PRIVATE_LEARNERS' | 'MULTI_TARGET' = 'SCHOOL_CLASS';

    if (schoolsArr.length > 0 && studentsArr.length > 0) {
      mode = 'MULTI_TARGET';
    } else if (schoolsArr.length > 1) {
      mode = 'MULTI_TARGET';
    } else if (studentsArr.length > 0 && schoolsArr.length === 0) {
      mode = 'PRIVATE_LEARNERS';
    } else {
      mode = 'SCHOOL_CLASS';
    }

    onConfirm({
      targetSchoolIds: schoolsArr,
      targetStudentIds: studentsArr,
      recipientMode: mode,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#161B26] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/60 dark:to-[#161B26]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                Choose Target Recipients
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isTutor
                  ? 'Select from schools and private learners assigned to you.'
                  : 'Select target partner schools and private enrolled learners.'}
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

        {/* Filter Controls & Search */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-200/60 dark:bg-slate-800/80 rounded-2xl">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All ({availableSchools.length + availablePrivateStudents.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('schools')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                  activeTab === 'schools'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <School size={13} /> Schools ({availableSchools.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('private')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                  activeTab === 'private'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <User size={13} /> Private ({availablePrivateStudents.length})
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={selectAllVisible}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Select Visible
              </button>
              {totalSelectedCount > 0 && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <button
                    type="button"
                    onClick={clearAllSelected}
                    className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by school name, student name, class, or guardian..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Recipient List */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Active selection badge summary */}
          {totalSelectedCount > 0 && (
            <div className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                  {selectedSchoolIds.size} School(s) and {selectedStudentIds.size} Private Student(s) Selected
                </span>
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                {selectedSchoolIds.size > 0 && selectedStudentIds.size > 0
                  ? 'Multi-Target Cohort'
                  : selectedSchoolIds.size > 0
                  ? 'School-Based Assessment'
                  : 'Private Mentorship Assessment'}
              </span>
            </div>
          )}

          {/* Schools Section */}
          {(activeTab === 'all' || activeTab === 'schools') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Building2 size={13} /> Partner Schools ({filteredSchools.length})
                </span>
              </div>

              {filteredSchools.length === 0 ? (
                <div className="p-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                  <p className="text-xs text-slate-400">No partner schools matched your search.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredSchools.map((school) => {
                    const isSelected = selectedSchoolIds.has(school.id);
                    return (
                      <div
                        key={school.id}
                        onClick={() => toggleSchool(school.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-300 dark:bg-blue-950/40 dark:border-blue-700 text-blue-900 dark:text-blue-200 shadow-xs'
                            : 'bg-white dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            <School size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate leading-tight">{school.name}</p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {school.schoolCode ? `Code: ${school.schoolCode}` : 'Partner School'}
                            </p>
                          </div>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
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

          {/* Private Students Section */}
          {(activeTab === 'all' || activeTab === 'private') && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <GraduationCap size={13} /> Private Enrolled Students ({filteredStudents.length})
                </span>
              </div>

              {filteredStudents.length === 0 ? (
                <div className="p-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                  <p className="text-xs text-slate-400">No private learners matched your search.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredStudents.map((st) => {
                    const isSelected = selectedStudentIds.has(st.id);
                    return (
                      <div
                        key={st.id}
                        onClick={() => toggleStudent(st.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-emerald-50/80 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 shadow-xs'
                            : 'bg-white dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            <User size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate leading-tight">{st.fullName}</p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {st.className || st.class || 'Private Learner'}
                              {st.parentName ? ` · Parent: ${st.parentName}` : ''}
                            </p>
                          </div>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                            isSelected
                              ? 'bg-emerald-600 border-emerald-600 text-white'
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

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Selected: <strong className="text-slate-900 dark:text-white">{selectedSchoolIds.size}</strong> schools,{' '}
            <strong className="text-slate-900 dark:text-white">{selectedStudentIds.size}</strong> private learners
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              <Check size={14} />
              Confirm Recipients ({totalSelectedCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
