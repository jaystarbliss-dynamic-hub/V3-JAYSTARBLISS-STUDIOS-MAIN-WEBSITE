import React, { useState, useEffect, useCallback } from 'react';
import { 
  collection, getDocs, addDoc, deleteDoc, doc, updateDoc,
  query, orderBy, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { ResourceListView } from '../../components/portal/ResourceListView';
import { 
  FolderOpen, Link as LinkIcon, Plus, Trash2, 
  ExternalLink, Search, FileText, BookOpen, Edit3,
  X, Check, Save, Layers, School
} from 'lucide-react';

const AVAILABLE_CLASSES = [
  'All Classes',
  'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
  'JSS 1', 'JSS 2', 'JSS 3',
  'SSS 1', 'SSS 2', 'SSS 3',
  'Coding & Robotics Club', 'Creative Tech & Media'
];

const AdminResources: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'resources' | 'links' | 'exams'>('resources');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Editing state for Resources, Links, Exams
  const [editingItem, setEditingItem] = useState<{
    id: string;
    type: 'resources' | 'links' | 'exams';
    title: string;
    category: string;
    subject?: string;
    classLevel?: string;
    assignedClasses?: string[];
    description?: string;
    fileUrl?: string;
    url?: string;
    assignedSchoolId?: string;
    assignedSchoolName?: string;
    assignedProgramId?: string;
    assignedProgramName?: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Schools and Programs Catalog for Scoped Assignment
  const [schoolsList, setSchoolsList] = useState<{ id: string; name: string; programs?: any[] }[]>([]);
  const [programsList, setProgramsList] = useState<{ id: string; title?: string; name?: string }[]>([]);

  // Resources state
  const [resources, setResources] = useState<any[]>([]);
  const [resForm, setResForm] = useState({
    title: '',
    category: 'both',
    subject: 'Computer Science & ICT',
    classLevel: 'All Classes',
    assignedClasses: ['All Classes'],
    assignedSchoolId: 'all',
    assignedSchoolName: 'All Schools (Universal)',
    assignedProgramId: 'all',
    assignedProgramName: 'All Programmes (Universal)',
    description: '',
    fileUrl: ''
  });
  const [resSubmitting, setResSubmitting] = useState(false);

  // Links state
  const [links, setLinks] = useState<any[]>([]);
  const [linkForm, setLinkForm] = useState({
    title: '',
    category: 'both',
    url: '',
    description: '',
    assignedSchoolId: 'all',
    assignedSchoolName: 'All Schools (Universal)',
    assignedProgramId: 'all',
    assignedProgramName: 'All Programmes (Universal)'
  });
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [previewLinkUrl, setPreviewLinkUrl] = useState('');

  // Exams state
  const [exams, setExams] = useState<any[]>([]);
  const [examForm, setExamForm] = useState({
    title: '',
    category: 'both',
    url: '',
    description: '',
    assignedSchoolId: 'all',
    assignedSchoolName: 'All Schools (Universal)',
    assignedProgramId: 'all',
    assignedProgramName: 'All Programmes (Universal)'
  });
  const [examSubmitting, setExamSubmitting] = useState(false);

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resSnap, linksSnap, examsSnap, schoolsSnap, progsSnap] = await Promise.all([
        getDocs(query(collection(db, 'resources'), orderBy('timestamp', 'desc'))).catch(() => getDocs(collection(db, 'resources'))),
        getDocs(query(collection(db, 'links'), orderBy('timestamp', 'desc'))).catch(() => getDocs(collection(db, 'links'))),
        getDocs(query(collection(db, 'exams'), orderBy('timestamp', 'desc'))).catch(() => getDocs(collection(db, 'exams'))),
        getDocs(collection(db, 'schools')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'programs')).catch(() => ({ docs: [] } as any))
      ]);

      setResources(resSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLinks(linksSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setExams(examsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const schoolsData = schoolsSnap.docs.map((d: any) => ({
        id: d.id,
        name: d.data().name || d.id,
        programs: d.data().programs || []
      }));
      setSchoolsList(schoolsData);

      const progsData = progsSnap.docs.map((d: any) => ({
        id: d.id,
        title: d.data().title || d.data().name || d.id,
        name: d.data().name || d.data().title || d.id
      }));
      setProgramsList(progsData);
    } catch (err: any) {
      console.error('Error loading resources:', err);
      toast.error('Failed to load learning resources.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Post Resource
  const handlePostResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resForm.title.trim() || !resForm.fileUrl.trim()) {
      toast.error('Please enter a title and valid file URL.');
      return;
    }
    setResSubmitting(true);
    try {
      await addDoc(collection(db, 'resources'), {
        title: resForm.title.trim(),
        category: resForm.category,
        subject: resForm.subject || 'Computer Science & ICT',
        classLevel: resForm.classLevel || 'All Classes',
        assignedClasses: resForm.assignedClasses || ['All Classes'],
        assignedSchoolId: resForm.assignedSchoolId || 'all',
        schoolId: resForm.assignedSchoolId || 'all',
        assignedSchoolName: resForm.assignedSchoolName || 'All Schools (Universal)',
        assignedProgramId: resForm.assignedProgramId || 'all',
        programId: resForm.assignedProgramId || 'all',
        assignedProgramName: resForm.assignedProgramName || 'All Programmes (Universal)',
        description: resForm.description.trim(),
        fileUrl: resForm.fileUrl.trim(),
        timestamp: serverTimestamp()
      });
      toast.success(`Resource "${resForm.title}" uploaded and published successfully!`);
      setResForm({ 
        title: '', 
        category: 'both', 
        subject: 'Computer Science & ICT', 
        classLevel: 'All Classes', 
        assignedClasses: ['All Classes'], 
        assignedSchoolId: 'all',
        assignedSchoolName: 'All Schools (Universal)',
        assignedProgramId: 'all',
        assignedProgramName: 'All Programmes (Universal)',
        description: '', 
        fileUrl: '' 
      });
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error('Error posting resource: ' + err.message);
    } finally {
      setResSubmitting(false);
    }
  };

  // Post Link
  const handlePostLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkForm.title.trim() || !linkForm.url.trim()) {
      toast.error('Please enter a title and valid URL.');
      return;
    }
    setLinkSubmitting(true);
    try {
      await addDoc(collection(db, 'links'), {
        title: linkForm.title.trim(),
        category: linkForm.category,
        url: linkForm.url.trim(),
        assignedSchoolId: linkForm.assignedSchoolId || 'all',
        schoolId: linkForm.assignedSchoolId || 'all',
        assignedSchoolName: linkForm.assignedSchoolName || 'All Schools (Universal)',
        assignedProgramId: linkForm.assignedProgramId || 'all',
        programId: linkForm.assignedProgramId || 'all',
        assignedProgramName: linkForm.assignedProgramName || 'All Programmes (Universal)',
        description: linkForm.description.trim(),
        timestamp: serverTimestamp()
      });
      toast.success(`Link "${linkForm.title}" posted successfully!`);
      setLinkForm({ 
        title: '', 
        category: 'both', 
        url: '', 
        description: '',
        assignedSchoolId: 'all',
        assignedSchoolName: 'All Schools (Universal)',
        assignedProgramId: 'all',
        assignedProgramName: 'All Programmes (Universal)'
      });
      setPreviewLinkUrl('');
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error('Error posting link: ' + err.message);
    } finally {
      setLinkSubmitting(false);
    }
  };

  // Post Exam
  const handlePostExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examForm.title.trim() || !examForm.url.trim()) {
      toast.error('Please enter an exam title and link.');
      return;
    }
    setExamSubmitting(true);
    try {
      await addDoc(collection(db, 'exams'), {
        title: examForm.title.trim(),
        category: examForm.category,
        url: examForm.url.trim(),
        assignedSchoolId: examForm.assignedSchoolId || 'all',
        schoolId: examForm.assignedSchoolId || 'all',
        assignedSchoolName: examForm.assignedSchoolName || 'All Schools (Universal)',
        assignedProgramId: examForm.assignedProgramId || 'all',
        programId: examForm.assignedProgramId || 'all',
        assignedProgramName: examForm.assignedProgramName || 'All Programmes (Universal)',
        description: examForm.description.trim(),
        timestamp: serverTimestamp()
      });
      toast.success(`Exam/Assessment "${examForm.title}" posted successfully!`);
      setExamForm({ 
        title: '', 
        category: 'both', 
        url: '', 
        description: '',
        assignedSchoolId: 'all',
        assignedSchoolName: 'All Schools (Universal)',
        assignedProgramId: 'all',
        assignedProgramName: 'All Programmes (Universal)'
      });
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error('Error posting exam: ' + err.message);
    } finally {
      setExamSubmitting(false);
    }
  };

  // Save edited resource/link/exam
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!editingItem.title.trim()) {
      toast.error('Please provide a title.');
      return;
    }
    const targetUrl = editingItem.fileUrl || editingItem.url || '';
    if (!targetUrl.trim()) {
      toast.error('Please provide a valid URL or file link.');
      return;
    }

    setSavingEdit(true);
    try {
      const docRef = doc(db, editingItem.type, editingItem.id);
      const updates: any = {
        title: editingItem.title.trim(),
        category: editingItem.category,
        assignedSchoolId: editingItem.assignedSchoolId || 'all',
        schoolId: editingItem.assignedSchoolId || 'all',
        assignedSchoolName: editingItem.assignedSchoolName || 'All Schools (Universal)',
        assignedProgramId: editingItem.assignedProgramId || 'all',
        programId: editingItem.assignedProgramId || 'all',
        assignedProgramName: editingItem.assignedProgramName || 'All Programmes (Universal)',
        description: (editingItem.description || '').trim(),
        updatedAt: serverTimestamp()
      };

      if (editingItem.type === 'resources') {
        updates.subject = editingItem.subject || 'Computer Science & ICT';
        updates.classLevel = editingItem.classLevel || 'All Classes';
        updates.assignedClasses = editingItem.assignedClasses || [updates.classLevel];
        updates.fileUrl = targetUrl.trim();
      } else {
        updates.url = targetUrl.trim();
      }

      await updateDoc(docRef, updates);
      toast.success(`"${editingItem.title}" updated successfully!`);
      setEditingItem(null);
      fetchData();
    } catch (err: any) {
      console.error('Error updating resource:', err);
      toast.error('Failed to update: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete handler
  const handleDelete = async (id: string, collectionName: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
      toast.success(`Deleted "${title}" successfully.`);
      fetchData();
    } catch (err: any) {
      toast.error('Failed to delete item: ' + err.message);
    }
  };

  const fmtCategory = (cat: string) => {
    if (cat === 'school') return 'School Lectures';
    if (cat === 'private') return 'Private Lectures';
    if (cat === 'both') return 'All Students (Universal)';
    return cat || 'General';
  };

  const filteredResources = resources.filter(r => 
    r.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLinks = links.filter(l => 
    l.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    l.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredExams = exams.filter(e => 
    e.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    e.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Search Toolbar */}
      <div className="flex items-center justify-end">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-3 text-gray-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items..."
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-800 space-x-4">
        <button
          onClick={() => setActiveTab('resources')}
          className={`pb-3 px-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'resources'
              ? 'border-brand-red text-brand-red'
              : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FolderOpen size={17} />
          <span>General Resources & Files ({resources.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('links')}
          className={`pb-3 px-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'links'
              ? 'border-brand-red text-brand-red'
              : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <LinkIcon size={17} />
          <span>General Platform Links ({links.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('exams')}
          className={`pb-3 px-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'exams'
              ? 'border-brand-red text-brand-red'
              : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FileText size={17} />
          <span>Exams & Question Links ({exams.length})</span>
        </button>
      </div>

      {/* ══ TAB 1: RESOURCES ══ */}
      {activeTab === 'resources' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload / Publish Form */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm">
            <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2 mb-2">
              <Plus size={18} className="text-brand-red" />
              Publish General Resource
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
              Upload your PDF/DOCX to Google Drive, Dropbox, or OneDrive. Set sharing to "Anyone with the link can view", then paste the link below.
            </p>

            <form onSubmit={handlePostResource} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Resource Title *
                </label>
                <input
                  type="text"
                  required
                  value={resForm.title}
                  onChange={(e) => setResForm({ ...resForm, title: e.target.value })}
                  placeholder="e.g. Python Full Stack Handbook"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Target Audience / Category
                </label>
                <select
                  value={resForm.category}
                  onChange={(e) => setResForm({ ...resForm, category: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                >
                  <option value="both">Both (School & Private Students)</option>
                  <option value="school">School Lectures Only</option>
                  <option value="private">Private / Individual Students Only</option>
                  <option value="coding">Coding & Software</option>
                  <option value="math">Mathematics</option>
                  <option value="science">Science & Robotics</option>
                  <option value="art">Design & Creative Art</option>
                </select>
              </div>

              {/* Target Class / Grade */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Target Class / Grade
                </label>
                <select
                  value={resForm.classLevel}
                  onChange={(e) => setResForm({ 
                    ...resForm, 
                    classLevel: e.target.value,
                    assignedClasses: [e.target.value]
                  })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                >
                  <option value="All Classes">All Classes (Universal Delivery)</option>
                  <option value="Primary 1">Primary 1</option>
                  <option value="Primary 2">Primary 2</option>
                  <option value="Primary 3">Primary 3</option>
                  <option value="Primary 4">Primary 4</option>
                  <option value="Primary 5">Primary 5</option>
                  <option value="Primary 6">Primary 6</option>
                  <option value="JSS 1">JSS 1</option>
                  <option value="JSS 2">JSS 2</option>
                  <option value="JSS 3">JSS 3</option>
                  <option value="SSS 1">SSS 1</option>
                  <option value="SSS 2">SSS 2</option>
                  <option value="SSS 3">SSS 3</option>
                  <option value="Grade 1">Grade 1</option>
                  <option value="Grade 2">Grade 2</option>
                  <option value="Grade 3">Grade 3</option>
                  <option value="Grade 4">Grade 4</option>
                  <option value="Grade 5">Grade 5</option>
                  <option value="Grade 6">Grade 6</option>
                </select>
              </div>

              {/* School & Program Scoping */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-black text-gray-800 dark:text-gray-200 uppercase tracking-wider">
                  <School size={14} className="text-brand-red" />
                  <span>Institutional &amp; Programme Scope</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
                      Assign to School
                    </label>
                    <select
                      value={resForm.assignedSchoolId}
                      onChange={(e) => {
                        const sch = schoolsList.find(s => s.id === e.target.value);
                        setResForm({
                          ...resForm,
                          assignedSchoolId: e.target.value,
                          assignedSchoolName: sch ? sch.name : 'All Schools (Universal)',
                          assignedProgramId: 'all',
                          assignedProgramName: 'All Programmes (Universal)'
                        });
                      }}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                    >
                      <option value="all">All Schools (Universal)</option>
                      {schoolsList.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
                      Assign to Programme Track
                    </label>
                    <select
                      value={resForm.assignedProgramId}
                      onChange={(e) => {
                        const selProgId = e.target.value;
                        let pName = 'All Programmes (Universal)';
                        if (selProgId !== 'all') {
                          const selectedSch = schoolsList.find(s => s.id === resForm.assignedSchoolId);
                          const pInSch = selectedSch?.programs?.find((p: any) => p.id === selProgId || p.name === selProgId);
                          const pInGlobal = programsList.find(p => p.id === selProgId);
                          pName = pInSch?.name || pInGlobal?.name || pInGlobal?.title || selProgId;
                        }
                        setResForm({
                          ...resForm,
                          assignedProgramId: selProgId,
                          assignedProgramName: pName
                        });
                      }}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                    >
                      <option value="all">All Programmes (Universal)</option>
                      {resForm.assignedSchoolId !== 'all' && (
                        schoolsList.find(s => s.id === resForm.assignedSchoolId)?.programs?.map((p: any) => (
                          <option key={p.id} value={p.id}>{p.name} (School Track)</option>
                        ))
                      )}
                      {programsList.map(p => (
                        <option key={p.id} value={p.id}>{p.name || p.title}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  Only students enrolled under this selected programme track will be able to see and download this resource.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  File Download URL *
                </label>
                <input
                  type="url"
                  required
                  value={resForm.fileUrl}
                  onChange={(e) => setResForm({ ...resForm, fileUrl: e.target.value })}
                  placeholder="https://drive.google.com/file/d/..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Description & Instructions
                </label>
                <textarea
                  rows={3}
                  value={resForm.description}
                  onChange={(e) => setResForm({ ...resForm, description: e.target.value })}
                  placeholder="Summary of contents, modules covered, and instructions for scholars..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={resSubmitting}
                className="w-full py-3 bg-brand-red hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {resSubmitting ? 'Uploading...' : 'Publish Resource'}
              </button>
            </form>
          </div>

          {/* List of Published Resources (List Format with Filters & Unread Indicators) */}
          <div className="lg:col-span-2 space-y-4">
            <ResourceListView
              resources={resources}
              role="admin"
              title="Published Resources"
              showEditButton={true}
              showDeleteButton={true}
              onEdit={(item) => setEditingItem({
                id: item.id,
                type: 'resources',
                title: item.title,
                category: item.category || 'both',
                subject: item.subject || 'Computer Science & ICT',
                classLevel: item.classLevel || 'All Classes',
                assignedClasses: item.assignedClasses || [item.classLevel || 'All Classes'],
                description: item.description || '',
                fileUrl: item.fileUrl || item.url || ''
              })}
              onDelete={(item) => handleDelete(item.id, 'resources', item.title)}
              onPreview={(item) => {
                const url = item.fileUrl || item.url;
                if (url) {
                  window.open(url, '_blank');
                }
              }}
              emptyMessage={loading ? "Loading resources..." : "No resources found matching your filters."}
            />
          </div>
        </div>
      )}

      {/* ══ TAB 2: GENERAL LINKS ══ */}
      {activeTab === 'links' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Post Link Form */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm">
            <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2 mb-2">
              <Plus size={18} className="text-brand-red" />
              Deploy Platform Link
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
              Share interactive tool links (Scratch Studio, GitHub, Replit, Figma, or CodePen) directly into student portals.
            </p>

            <form onSubmit={handlePostLink} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Link Title *
                </label>
                <input
                  type="text"
                  required
                  value={linkForm.title}
                  onChange={(e) => setLinkForm({ ...linkForm, title: e.target.value })}
                  placeholder="e.g. Scratch Game Engine Hub"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Category
                </label>
                <select
                  value={linkForm.category}
                  onChange={(e) => setLinkForm({ ...linkForm, category: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                >
                  <option value="both">Both (School & Private Students)</option>
                  <option value="school">School Lectures</option>
                  <option value="private">Private Lectures</option>
                  <option value="tutorial">Video Tutorials</option>
                  <option value="tools">Coding Tools & IDEs</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  URL *
                </label>
                <input
                  type="url"
                  required
                  value={linkForm.url}
                  onChange={(e) => {
                    setLinkForm({ ...linkForm, url: e.target.value });
                    setPreviewLinkUrl(e.target.value);
                  }}
                  placeholder="https://scratch.mit.edu/..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={linkForm.description}
                  onChange={(e) => setLinkForm({ ...linkForm, description: e.target.value })}
                  placeholder="What is this link and how should scholars interact with it?"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={linkSubmitting}
                className="w-full py-3 bg-brand-red hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {linkSubmitting ? 'Posting...' : 'Deploy Link'}
              </button>
            </form>

            {previewLinkUrl && (
              <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 text-xs">
                <p className="font-bold text-gray-700 dark:text-gray-300 mb-2">Live Preview Test:</p>
                <iframe 
                  src={previewLinkUrl} 
                  title="Link Preview"
                  className="w-full h-36 border border-gray-200 dark:border-slate-700 rounded-lg bg-white"
                />
              </div>
            )}
          </div>

          {/* List of Published Links */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-black text-gray-900 dark:text-white">
              Platform Links ({filteredLinks.length})
            </h2>

            {loading ? (
              <div className="py-12 text-center text-gray-400 font-mono text-xs">Loading links...</div>
            ) : filteredLinks.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 text-gray-400 text-sm">
                No links found matching your search.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredLinks.map((item) => (
                  <div 
                    key={item.id} 
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-gray-300 dark:hover:border-slate-700 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                          {fmtCategory(item.category)}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingItem({
                              id: item.id,
                              type: 'links',
                              title: item.title,
                              category: item.category || 'both',
                              description: item.description || '',
                              url: item.url
                            })}
                            className="text-gray-400 hover:text-sky-500 transition-colors p-1"
                            title="Edit Link"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, 'links', item.title)}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1"
                            title="Delete Link"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      <h3 className="font-black text-gray-900 dark:text-white text-base leading-snug mb-1">
                        {item.title}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 mb-4 leading-relaxed">
                        {item.description || 'Direct platform access link.'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <ExternalLink size={14} /> Open URL
                      </a>
                      <span className="text-[11px] text-gray-400 font-mono">
                        {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleDateString() : 'Active'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ TAB 3: EXAMS ══ */}
      {activeTab === 'exams' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Post Exam Form */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm">
            <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2 mb-2">
              <Plus size={18} className="text-brand-red" />
              Deploy Question &amp; Exam
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
              Create an online test on Google Forms or Typeform, paste the public response link, and assign it to student cohorts.
            </p>

            <form onSubmit={handlePostExam} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Exam Title *
                </label>
                <input
                  type="text"
                  required
                  value={examForm.title}
                  onChange={(e) => setExamForm({ ...examForm, title: e.target.value })}
                  placeholder="e.g. Mid-Term Python Logic Quiz"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Category
                </label>
                <select
                  value={examForm.category}
                  onChange={(e) => setExamForm({ ...examForm, category: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                >
                  <option value="both">Both (School & Private Students)</option>
                  <option value="school">School Lectures</option>
                  <option value="private">Private Lectures</option>
                  <option value="coding">Programming Assessment</option>
                  <option value="math">Mathematics Assessment</option>
                  <option value="science">Science & Robotics</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Exam Link (Google Forms / Typeform) *
                </label>
                <input
                  type="url"
                  required
                  value={examForm.url}
                  onChange={(e) => setExamForm({ ...examForm, url: e.target.value })}
                  placeholder="https://forms.google.com/..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Instructions & Timing
                </label>
                <textarea
                  rows={3}
                  value={examForm.description}
                  onChange={(e) => setExamForm({ ...examForm, description: e.target.value })}
                  placeholder="Exam duration, rules, submission deadlines, and grading notes..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={examSubmitting}
                className="w-full py-3 bg-brand-red hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {examSubmitting ? 'Deploying...' : 'Deploy Exam Questions'}
              </button>
            </form>
          </div>

          {/* List of Published Exams */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-black text-gray-900 dark:text-white">
              Published Exams ({filteredExams.length})
            </h2>

            {loading ? (
              <div className="py-12 text-center text-gray-400 font-mono text-xs">Loading exams...</div>
            ) : filteredExams.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 text-gray-400 text-sm">
                No exams found matching your search.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredExams.map((item) => (
                  <div 
                    key={item.id} 
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-gray-300 dark:hover:border-slate-700 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                          {fmtCategory(item.category)}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingItem({
                              id: item.id,
                              type: 'exams',
                              title: item.title,
                              category: item.category || 'both',
                              description: item.description || '',
                              url: item.url
                            })}
                            className="text-gray-400 hover:text-emerald-500 transition-colors p-1"
                            title="Edit Exam"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, 'exams', item.title)}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1"
                            title="Delete Exam"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      <h3 className="font-black text-gray-900 dark:text-white text-base leading-snug mb-1">
                        {item.title}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 mb-4 leading-relaxed">
                        {item.description || 'Instructions provided within the examination link.'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        <ExternalLink size={14} /> Open Exam Paper
                      </a>
                      <span className="text-[11px] text-gray-400 font-mono">
                        {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleDateString() : 'Active'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ EDIT MODAL ══ */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-2xl border border-gray-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center">
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">
                    Edit {editingItem.type === 'resources' ? 'Learning Resource' : editingItem.type === 'links' ? 'Platform Link' : 'Examination'}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Update titles, access links, audience and class reassignments
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={editingItem.title}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                    Category
                  </label>
                  <select
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                  >
                    <option value="both">Both (School & Private Students)</option>
                    <option value="school">School Lectures</option>
                    <option value="private">Private / Individual Students</option>
                    <option value="coding">Coding & Software</option>
                    <option value="math">Mathematics</option>
                    <option value="science">Science & Robotics</option>
                  </select>
                </div>

                {editingItem.type === 'resources' && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={editingItem.subject || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, subject: e.target.value })}
                      placeholder="e.g. Computer Science"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                    />
                  </div>
                )}
              </div>

              {/* Class Reassignment for Resources */}
              {editingItem.type === 'resources' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                    Class Assignment / Target Classes
                  </label>
                  <div className="p-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-850 space-y-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_CLASSES.map((cls) => {
                        const isSelected = (editingItem.assignedClasses || []).includes(cls) || editingItem.classLevel === cls;
                        return (
                          <button
                            type="button"
                            key={cls}
                            onClick={() => {
                              let nextClasses: string[];
                              if (cls === 'All Classes') {
                                nextClasses = ['All Classes'];
                              } else {
                                const current = (editingItem.assignedClasses || []).filter(c => c !== 'All Classes');
                                if (current.includes(cls)) {
                                  nextClasses = current.filter(c => c !== cls);
                                  if (nextClasses.length === 0) nextClasses = ['All Classes'];
                                } else {
                                  nextClasses = [...current, cls];
                                }
                              }
                              setEditingItem({
                                ...editingItem,
                                classLevel: nextClasses[0] || 'All Classes',
                                assignedClasses: nextClasses
                              });
                            }}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                              isSelected
                                ? 'bg-brand-red text-white shadow-xs'
                                : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-slate-700 hover:border-brand-red'
                            }`}
                          >
                            {cls}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Select specific classes (e.g. Grade 1, Primary 3) so only students in those classes see this resource, or select "All Classes" for universal visibility.
                    </p>
                  </div>
                </div>
              )}

              {/* Institutional & Program Scoping */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-black text-gray-800 dark:text-gray-200 uppercase tracking-wider">
                  <School size={14} className="text-brand-red" />
                  <span>Institutional &amp; Programme Scope</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
                      Assigned School
                    </label>
                    <select
                      value={editingItem.assignedSchoolId || 'all'}
                      onChange={(e) => {
                        const sch = schoolsList.find(s => s.id === e.target.value);
                        setEditingItem({
                          ...editingItem,
                          assignedSchoolId: e.target.value,
                          assignedSchoolName: sch ? sch.name : 'All Schools (Universal)',
                          assignedProgramId: 'all',
                          assignedProgramName: 'All Programmes (Universal)'
                        });
                      }}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                    >
                      <option value="all">All Schools (Universal)</option>
                      {schoolsList.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
                      Assigned Programme Track
                    </label>
                    <select
                      value={editingItem.assignedProgramId || 'all'}
                      onChange={(e) => {
                        const selProgId = e.target.value;
                        let pName = 'All Programmes (Universal)';
                        if (selProgId !== 'all') {
                          const selectedSch = schoolsList.find(s => s.id === editingItem.assignedSchoolId);
                          const pInSch = selectedSch?.programs?.find((p: any) => p.id === selProgId || p.name === selProgId);
                          const pInGlobal = programsList.find(p => p.id === selProgId);
                          pName = pInSch?.name || pInGlobal?.name || pInGlobal?.title || selProgId;
                        }
                        setEditingItem({
                          ...editingItem,
                          assignedProgramId: selProgId,
                          assignedProgramName: pName
                        });
                      }}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                    >
                      <option value="all">All Programmes (Universal)</option>
                      {editingItem.assignedSchoolId && editingItem.assignedSchoolId !== 'all' && (
                        schoolsList.find(s => s.id === editingItem.assignedSchoolId)?.programs?.map((p: any) => (
                          <option key={p.id} value={p.id}>{p.name} (School Track)</option>
                        ))
                      )}
                      {programsList.map(p => (
                        <option key={p.id} value={p.id}>{p.name || p.title}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  {editingItem.type === 'resources' ? 'File Download URL / Google Drive link *' : 'Web URL *'}
                </label>
                <input
                  type="url"
                  required
                  value={editingItem.fileUrl || editingItem.url || ''}
                  onChange={(e) => setEditingItem({
                    ...editingItem,
                    fileUrl: e.target.value,
                    url: e.target.value
                  })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Description & Instructions
                </label>
                <textarea
                  rows={3}
                  value={editingItem.description || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                ></textarea>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-800 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2.5 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Save size={15} />
                  <span>{savingEdit ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminResources;
