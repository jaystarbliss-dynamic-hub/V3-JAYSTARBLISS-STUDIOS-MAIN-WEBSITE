import React, { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { getAllClientDatabases } from '../../lib/firebase';
import { Plus, Trash2, Edit3, ExternalLink, Gamepad2, Briefcase } from 'lucide-react';
import { Link } from 'react-router-dom';

const AdminPortfolio: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'ALL' | 'CLIENT_WORK' | 'STUDENT_WORK'>('ALL');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const dbs = getAllClientDatabases();
      const merged = new Map<string, any>();

      await Promise.all(
        dbs.map(async (clientDb) => {
          try {
            const snapshot = await getDocs(collection(clientDb, 'portfolio'));
            snapshot.docs.forEach((docSnap) => {
              if (!merged.has(docSnap.id)) {
                merged.set(docSnap.id, { id: docSnap.id, _collection: 'portfolio', ...docSnap.data() });
              }
            });
          } catch {
            // ignore secondary db error
          }
          try {
            const kidsSnap = await getDocs(collection(clientDb, 'kidsProjects'));
            kidsSnap.docs.forEach((docSnap) => {
              if (!merged.has(docSnap.id)) {
                const d = docSnap.data();
                merged.set(docSnap.id, {
                  id: docSnap.id,
                  _collection: 'kidsProjects',
                  portfolioType: 'STUDENT_WORK',
                  studentName: d.creator || d.creatorName || d.studentName || 'Student',
                  studentAge: d.creatorAge || d.studentAge || '',
                  isFeatured: Boolean(d.isFeatured || d.featured),
                  featuredImage: d.imageUrl || d.featuredImage || '',
                  status: d.status || 'PUBLISHED',
                  ...d,
                });
              }
            });
          } catch {
            // ignore secondary db error
          }
        })
      );

      setProjects(Array.from(merged.values()));
    } catch (error) {
      console.error('Error fetching portfolio:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      const dbs = getAllClientDatabases();
      await Promise.all(
        dbs.flatMap((clientDb) => [
          deleteDoc(doc(clientDb, 'portfolio', id)).catch(() => null),
          deleteDoc(doc(clientDb, 'kidsProjects', id)).catch(() => null),
        ])
      );
      setProjects(projects.filter(p => p.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting project:', err);
      alert('Failed to delete project.');
    }
  };

  const filteredProjects = projects.filter(p => {
    if (filterType === 'ALL') return true;
    if (filterType === 'STUDENT_WORK') return p.portfolioType === 'STUDENT_WORK' || p.portfolioType === 'KIDS_CORNER';
    if (filterType === 'CLIENT_WORK') return p.portfolioType === 'CLIENT_WORK' || p.portfolioType === 'ORGANISATION' || !p.portfolioType;
    return true;
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <Link
            to="/portfolio"
            target="_blank"
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            <ExternalLink size={15} /> View Live Showcase
          </Link>
          <Link
            to="/admin/portfolio/new"
            className="flex items-center gap-2 bg-brand-red text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-700 shadow-md shadow-brand-red/20 transition-all"
          >
            <Plus size={16} /> Add Project / Game
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setFilterType('ALL')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            filterType === 'ALL'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          All Items ({projects.length})
        </button>
        <button
          onClick={() => setFilterType('STUDENT_WORK')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            filterType === 'STUDENT_WORK'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'text-gray-500 hover:text-amber-500'
          }`}
        >
          <Gamepad2 size={14} /> Kids Corner Games
        </button>
        <button
          onClick={() => setFilterType('CLIENT_WORK')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            filterType === 'CLIENT_WORK'
              ? 'bg-brand-red text-white'
              : 'text-gray-500 hover:text-brand-red'
          }`}
        >
          <Briefcase size={14} /> Organisation Projects
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 dark:border-slate-800 rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
          <thead className="bg-gray-50 dark:bg-slate-950">
            <tr>
              <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Project / Game</th>
              <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Section & Creator</th>
              <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</th>
              <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">Loading portfolio items...</td></tr>
            ) : filteredProjects.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No projects found. Click "Add Project / Game" to create one.
                </td>
              </tr>
            ) : (
              filteredProjects.map((p) => {
                const isKid = p.portfolioType === 'STUDENT_WORK' || p.portfolioType === 'KIDS_CORNER';
                return (
                  <tr key={p.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-950/60 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">
                          {isKid ? <Gamepad2 size={18} className="text-amber-500" /> : <Briefcase size={18} className="text-brand-red" />}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            {p.title}
                            {p.isFeatured && (
                              <span className="px-2 py-0.5 text-[10px] font-extrabold bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-md">
                                FEATURED
                              </span>
                            )}
                          </div>
                          {p.embedUrl && (
                            <span className="text-[11px] text-purple-600 dark:text-purple-400 font-mono">
                              Scratch/Web Embed active
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-sm">
                      {isKid ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                            <Gamepad2 size={12} /> Kids Corner
                          </span>
                          <div className="text-gray-900 dark:text-white font-medium">
                            {p.studentName || 'Student'} {p.studentAge ? `(Age ${p.studentAge})` : ''}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-red">
                            <Briefcase size={12} /> Organisation
                          </span>
                          <div className="text-gray-900 dark:text-white font-medium">
                            {p.client || 'Internal / B2B'}
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      <span className="px-2.5 py-1 rounded-md bg-gray-100 dark:bg-slate-800 text-xs font-medium">
                        {p.category || 'General'}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        p.status === 'PUBLISHED'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {p.status || 'DRAFT'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          to={`/admin/portfolio/${p.id}`}
                          className="p-1.5 rounded-lg text-brand-red hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Edit"
                        >
                          <Edit3 size={16} />
                        </Link>
                        <button
                          onClick={() => setDeleteConfirm(p.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
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

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 border border-gray-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Delete Project?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Are you sure you want to delete this project from the database? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPortfolio;
