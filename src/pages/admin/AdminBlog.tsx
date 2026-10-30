import React, { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { getAllClientDatabases } from '../../lib/firebase';
import { Plus, Trash2, Edit3, Newspaper, BookOpen, ExternalLink, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';

const AdminBlog: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'NEWS' | 'BLOG'>('NEWS');
  const [posts, setPosts] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; type: 'blog' | 'newsCorner' } | null>(null);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const dbs = getAllClientDatabases();
      const mergedPosts = new Map<string, any>();
      const mergedNews = new Map<string, any>();

      await Promise.all(
        dbs.map(async (clientDb) => {
          try {
            const blogSnap = await getDocs(collection(clientDb, 'blog'));
            blogSnap.docs.forEach((d) => {
              if (!mergedPosts.has(d.id)) mergedPosts.set(d.id, { id: d.id, ...d.data() });
            });
          } catch {
            // ignore secondary db error
          }
          try {
            const newsSnap = await getDocs(collection(clientDb, 'newsCorner'));
            newsSnap.docs.forEach((d) => {
              if (!mergedNews.has(d.id)) mergedNews.set(d.id, { id: d.id, ...d.data() });
            });
          } catch {
            // ignore secondary db error
          }
        })
      );

      setPosts(Array.from(mergedPosts.values()));
      setNews(Array.from(mergedNews.values()));
    } catch (error) {
      console.error('Error fetching blog & news:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleDelete = async (id: string, type: 'blog' | 'newsCorner') => {
    try {
      const dbs = getAllClientDatabases();
      await Promise.all(
        dbs.map((clientDb) => deleteDoc(doc(clientDb, type, id)).catch(() => null))
      );
      if (type === 'blog') {
        setPosts(posts.filter(p => p.id !== id));
      } else {
        setNews(news.filter(n => n.id !== id));
      }
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting item:', err);
      alert('Failed to delete item.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <Link
            to="/blog"
            target="_blank"
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            <ExternalLink size={15} /> View Live News/Blog
          </Link>
          <Link
            to={`/admin/blog/new?type=${activeTab === 'NEWS' ? 'news' : 'blog'}`}
            className="flex items-center gap-2 bg-brand-red text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-700 shadow-md shadow-brand-red/20 transition-all"
          >
            <Plus size={16} /> Add {activeTab === 'NEWS' ? 'News Bulletin' : 'Blog Post'}
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-gray-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('NEWS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'NEWS'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-gray-500 hover:text-cyan-500'
          }`}
        >
          <Newspaper size={15} />
          News Corner Bulletins ({news.length})
        </button>

        <button
          onClick={() => setActiveTab('BLOG')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'BLOG'
              ? 'bg-brand-red text-white shadow-md shadow-brand-red/20'
              : 'text-gray-500 hover:text-brand-red'
          }`}
        >
          <BookOpen size={15} />
          Articles & Tutorials ({posts.length})
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 dark:border-slate-800 rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
          <thead className="bg-gray-50 dark:bg-slate-950">
            <tr>
              <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {activeTab === 'NEWS' ? 'Bulletin Title' : 'Article Title'}
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {activeTab === 'NEWS' ? 'Category & Views' : 'Author'}
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-500">Loading records...</td></tr>
            ) : (activeTab === 'NEWS' ? news : posts).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  No {activeTab === 'NEWS' ? 'news bulletins' : 'blog articles'} found. Click "Add" to create one.
                </td>
              </tr>
            ) : (
              (activeTab === 'NEWS' ? news : posts).map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-950/60 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900 dark:text-white">{item.title}</div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{item.slug || item.id}</div>
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {activeTab === 'NEWS' ? (
                      <div className="space-y-1">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                          {item.category || 'Announcement'}
                        </span>
                        <div className="text-xs text-gray-400 flex items-center gap-1">
                          <Eye size={12} /> {item.views || 0} views
                        </div>
                      </div>
                    ) : (
                      <div className="text-gray-900 dark:text-white font-medium">
                        {item.author || 'Jaystarbliss Studios'}
                      </div>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                      item.status === 'PUBLISHED'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {item.status || 'DRAFT'}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        to={`/admin/blog/${item.id}?collection=${activeTab === 'NEWS' ? 'newsCorner' : 'blog'}`}
                        className="p-1.5 rounded-lg text-brand-red hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Edit"
                      >
                        <Edit3 size={16} />
                      </Link>
                      <button
                        onClick={() => setDeleteConfirm({ id: item.id, type: activeTab === 'NEWS' ? 'newsCorner' : 'blog' })}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 border border-gray-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Delete Item?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Are you sure you want to delete this {deleteConfirm.type === 'newsCorner' ? 'news bulletin' : 'blog post'}?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id, deleteConfirm.type)}
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

export default AdminBlog;
