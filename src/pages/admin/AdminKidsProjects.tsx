import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Gamepad2, 
  ExternalLink, 
  Play, 
  X, 
  Loader2, 
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PhotoUpload from '../../components/admin/PhotoUpload';

interface KidsProjectRecord {
  id?: string;
  title: string;
  creator: string;
  category: string;
  embedUrl: string;
  imageUrl: string;
  liveUrl: string;
  description: string;
  status: 'PUBLISHED' | 'DRAFT';
  isFeatured: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const emptyForm: KidsProjectRecord = {
  title: '',
  creator: '',
  category: 'Arcade Game',
  embedUrl: '',
  imageUrl: '',
  liveUrl: '',
  description: '',
  status: 'PUBLISHED',
  isFeatured: false
};

const AdminKidsProjects: React.FC = () => {
  const [projects, setProjects] = useState<KidsProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<KidsProjectRecord>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'kidsProjects'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as KidsProjectRecord));
      setProjects(list);
    } catch (err) {
      console.error('Error fetching kids projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: KidsProjectRecord) => {
    setEditingId(item.id || null);
    setFormData({
      title: item.title || '',
      creator: item.creator || '',
      category: item.category || 'Arcade Game',
      embedUrl: item.embedUrl || '',
      imageUrl: item.imageUrl || '',
      liveUrl: item.liveUrl || '',
      description: item.description || '',
      status: item.status || 'PUBLISHED',
      isFeatured: Boolean(item.isFeatured)
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.creator.trim()) {
      setFormError('Please provide both a Title and Creator name.');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const now = new Date().toISOString();
      const payload = {
        ...formData,
        updatedAt: now
      };

      if (!editingId) {
        payload.createdAt = now;
        const docRef = await addDoc(collection(db, 'kidsProjects'), payload);
        setProjects(prev => [{ id: docRef.id, ...payload }, ...prev]);
      } else {
        await updateDoc(doc(db, 'kidsProjects', editingId), payload);
        setProjects(prev => prev.map(p => p.id === editingId ? { ...p, ...payload } : p));
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving kids project:', err);
      setFormError(err.message || 'Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'kidsProjects', id));
      setProjects(prev => prev.filter(p => p.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Error deleting project:', err);
      alert('Failed to delete project.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Action Bar */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <Link
            to="/portfolio"
            target="_blank"
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            <ExternalLink size={15} /> View Public Kids Corner
          </Link>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 bg-amber-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-amber-400 shadow-md shadow-amber-500/20 transition-all"
          >
            <Plus size={16} /> Add Kids Project
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gamepad2 className="text-amber-400 shrink-0" size={20} />
          <p className="text-xs text-slate-300">
            <strong>Scratch Embeds Tip:</strong> Use embed URLs formatted like <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300 font-mono">https://scratch.mit.edu/projects/[PROJECT_ID]/embed</code> to enable seamless in-browser play!
          </p>
        </div>
        <Link 
          to="/magic-particles"
          className="text-xs text-cyan-400 hover:text-cyan-300 font-bold shrink-0 ml-4 flex items-center gap-1"
        >
          View Magic Particles &rarr;
        </Link>
      </div>

      {/* Table of Kids Projects */}
      <div className="bg-white dark:bg-slate-900 dark:border-slate-800 rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
          <thead className="bg-gray-50 dark:bg-slate-950">
            <tr>
              <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Project</th>
              <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Creator & Category</th>
              <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Embed / Preview</th>
              <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  <Loader2 className="animate-spin inline-block w-6 h-6 text-amber-500 mb-2" />
                  <div>Loading kids projects...</div>
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No custom kids projects created yet. Click "Add Kids Project" above to publish one!
                </td>
              </tr>
            ) : (
              projects.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-950/60 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <Gamepad2 size={16} className="text-amber-500" />
                      {item.title}
                      {item.isFeatured && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500 text-white uppercase">
                          Featured
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">
                        {item.description.replace(/<[^>]+>/g, '')}
                      </div>
                    )}
                  </td>

                  <td className="px-6 py-4 text-sm">
                    <div className="font-semibold text-gray-800 dark:text-gray-200">
                      {item.creator || 'Student'}
                    </div>
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      {item.category || 'Game'}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-xs font-mono text-gray-500 dark:text-gray-400 max-w-xs truncate">
                    {item.embedUrl ? (
                      <a 
                        href={item.embedUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                      >
                        <Play size={12} /> Playable Embed
                      </a>
                    ) : item.liveUrl ? (
                      <a 
                        href={item.liveUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink size={12} /> External Link
                      </a>
                    ) : (
                      <span className="text-gray-400">No URL</span>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      item.status === 'PUBLISHED' 
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                        : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400'
                    }`}>
                      {item.status || 'PUBLISHED'}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="p-2 text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                        title="Edit Project"
                      >
                        <Edit3 size={16} />
                      </button>

                      {deleteConfirmId === item.id ? (
                        <div className="flex items-center gap-1 bg-red-50 dark:bg-red-950/40 p-1 rounded-lg border border-red-200 dark:border-red-900">
                          <button
                            onClick={() => handleDelete(item.id!)}
                            className="px-2 py-1 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="p-1 text-gray-500 hover:text-gray-700 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(item.id!)}
                          className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                          title="Delete Project"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-slate-800 shadow-2xl p-6 md:p-8 relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-500 hover:text-gray-900 dark:hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold">
                <Gamepad2 size={20} />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-gray-900 dark:text-white">
                  {editingId ? 'Edit Kids Project' : 'Create Kids Project'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Publish a new playable student creation to the Kids Corner.
                </p>
              </div>
            </div>

            {formError && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium border border-red-200 dark:border-red-800 flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                    Project Title *
                  </label>
                  <input
                    type="text"
                    name="title"
                    required
                    value={formData.title}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g. Funfinity Arena"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                    Creator Name & Age *
                  </label>
                  <input
                    type="text"
                    name="creator"
                    required
                    value={formData.creator}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g. Sarah (Age 11)"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm"
                    placeholder="e.g. Arcade, Action, Math App"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm font-bold"
                  >
                    <option value="PUBLISHED">Published (Live)</option>
                    <option value="DRAFT">Draft (Hidden)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                  Embed URL (Scratch / Web Player)
                </label>
                <input
                  type="url"
                  name="embedUrl"
                  value={formData.embedUrl}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm font-mono text-xs"
                  placeholder="https://scratch.mit.edu/projects/1236660351/embed"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Leave empty if this is not an embeddable Scratch or HTML game.
                </p>
              </div>

              {formData.embedUrl && (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="text-[11px] font-bold text-amber-400 mb-2 flex items-center gap-1.5">
                    <Play size={12} /> Embed Preview:
                  </div>
                  <div className="aspect-[4/3] w-full max-w-sm mx-auto bg-black rounded-lg overflow-hidden">
                    <iframe
                      src={formData.embedUrl}
                      className="w-full h-full border-0"
                      title="Preview"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                  Live Scratch URL (Optional)
                </label>
                <input
                  type="url"
                  name="liveUrl"
                  value={formData.liveUrl}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm"
                  placeholder="https://scratch.mit.edu/projects/1236660351/"
                />
              </div>

              <PhotoUpload
                label="Game Thumbnail / Cover Photo"
                value={formData.imageUrl}
                onChange={(url) => setFormData(prev => ({ ...prev, imageUrl: url }))}
                helpText="Upload a photo / screenshot of the game. Uploads to Cloudinary."
              />

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                  Description & Game Rules
                </label>
                <textarea
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm resize-none"
                  placeholder="Describe what happens in the game and how to play..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isFeatured"
                  name="isFeatured"
                  checked={formData.isFeatured}
                  onChange={(e) => setFormData(prev => ({ ...prev, isFeatured: e.target.checked }))}
                  className="rounded text-amber-500 focus:ring-amber-500 h-4 w-4"
                />
                <label htmlFor="isFeatured" className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  Feature prominently on Kids Game Zone banner
                </label>
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 font-bold text-xs hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 disabled:opacity-60 flex items-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'SAVING...' : editingId ? 'UPDATE PROJECT' : 'PUBLISH TO KIDS CORNER'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminKidsProjects;
