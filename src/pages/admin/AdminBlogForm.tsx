import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { doc, getDoc, addDoc, updateDoc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArrowLeft, Loader2, Newspaper, BookOpen } from 'lucide-react';
import RichTextEditor from '../../components/admin/RichTextEditor';
import PhotoUpload from '../../components/admin/PhotoUpload';

const AdminBlogForm: React.FC = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  
  const queryType = searchParams.get('type') || searchParams.get('collection');
  const initialCollection = queryType === 'news' || queryType === 'newsCorner' ? 'newsCorner' : 'blog';

  const [activeCollection, setActiveCollection] = useState<'blog' | 'newsCorner'>(initialCollection);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    author: 'Jaystarbliss Studios',
    category: 'announcement',
    featuredImage: '',
    excerpt: '',
    content: '',
    status: 'PUBLISHED'
  });

  useEffect(() => {
    if (isEditing && id) {
      // Try to fetch from specified collection first, or fallback
      const targetCol = searchParams.get('collection') === 'newsCorner' ? 'newsCorner' : 'blog';
      setActiveCollection(targetCol);

      getDoc(doc(db, targetCol, id)).then(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFormData({
            title: data.title || '',
            slug: data.slug || '',
            author: data.author || 'Jaystarbliss Studios',
            category: data.category || 'announcement',
            featuredImage: data.featuredImage || '',
            excerpt: data.excerpt || '',
            content: data.content || '',
            status: data.status || 'PUBLISHED'
          });
        }
        setLoading(false);
      }).catch((err) => {
        console.error(err);
        setError('Failed to load document');
        setLoading(false);
      });
    }
  }, [id, isEditing, searchParams]);

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    if (name === 'title' && !isEditing) {
      const autoSlug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      setFormData(prev => ({ ...prev, title: value, slug: autoSlug }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload: any = {
        ...formData,
        updatedAt: new Date().toISOString()
      };

      if (!isEditing) {
        payload.createdAt = new Date().toISOString();
        if (activeCollection === 'newsCorner') {
          payload.views = 0;
        }
        await addDoc(collection(db, activeCollection), payload);
      } else {
        await updateDoc(doc(db, activeCollection, id!), payload);
      }

      navigate('/admin/blog');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-20 text-center">
        <Loader2 className="animate-spin inline-block w-8 h-8 text-brand-red" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin/blog" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
          <ArrowLeft size={16} />
          <span>Back to Blog &amp; News</span>
        </Link>
        <p className="text-xs text-slate-500">
          {isEditing ? `Editing ${activeCollection === 'newsCorner' ? 'News Bulletin' : 'Blog Post'}` : 'Publish educational content, coding insights, or hub announcements.'}
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 dark:border-slate-800 rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 space-y-6">
        
        {/* Type Selector if creating new */}
        {!isEditing && (
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
              Publication Destination *
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setActiveCollection('newsCorner')}
                className={`p-4 rounded-xl border-2 flex items-center gap-3 transition-all text-left ${
                  activeCollection === 'newsCorner'
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-900 dark:text-cyan-300 shadow-sm'
                    : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Newspaper className={activeCollection === 'newsCorner' ? 'text-cyan-500' : 'text-gray-400'} size={24} />
                <div>
                  <div className="font-bold text-sm">News Corner Bulletin</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Announcements, events, competitions & awards</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveCollection('blog')}
                className={`p-4 rounded-xl border-2 flex items-center gap-3 transition-all text-left ${
                  activeCollection === 'blog'
                    ? 'border-brand-red bg-brand-red/10 text-slate-900 dark:text-white shadow-sm'
                    : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 text-gray-700 dark:text-gray-300'
                }`}
              >
                <BookOpen className={activeCollection === 'blog' ? 'text-brand-red' : 'text-gray-400'} size={24} />
                <div>
                  <div className="font-bold text-sm">Blog & Tutorial Article</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Longform tech guides, thought leadership & tutorials</div>
                </div>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Title *
            </label>
            <input
              type="text"
              name="title"
              required
              value={formData.title}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-red"
              placeholder="e.g. Young Coders Win National Award"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              URL Slug *
            </label>
            <input
              type="text"
              name="slug"
              required
              value={formData.slug}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-red font-mono text-sm"
              placeholder="young-coders-win-national-award"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Author
            </label>
            <input
              type="text"
              name="author"
              value={formData.author}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm"
              placeholder="e.g. John Rufai / Jaystarbliss Studios"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Category / Tag *
            </label>
            {activeCollection === 'newsCorner' ? (
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm font-semibold"
              >
                <option value="news">News & Bulletins</option>
                <option value="announcement">Announcement</option>
                <option value="event">Event</option>
                <option value="achievement">Achievement</option>
                <option value="update">System Update</option>
                <option value="holiday">Holiday Notice</option>
              </select>
            ) : (
              <div>
                <input
                  type="text"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm"
                  placeholder="e.g. news, coding, tutorial, robotics"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['news', 'tutorials', 'coding', 'robotics', 'announcement'].map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => setFormData(prev => ({ ...prev, category: tag }))}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase transition-colors ${
                        formData.category?.toLowerCase() === tag
                          ? 'bg-brand-red text-white'
                          : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
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

        <PhotoUpload
          label="Featured Article / Bulletin Photo"
          value={formData.featuredImage}
          onChange={(url) => setFormData(prev => ({ ...prev, featuredImage: url }))}
          helpText="Upload a high-quality cover photo. Uploads to Cloudinary CDN."
        />

        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
            Excerpt / Summary
          </label>
          <textarea
            name="excerpt"
            rows={3}
            value={formData.excerpt}
            onChange={handleChange}
            className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm resize-none"
            placeholder="Brief 1-2 sentence preview..."
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
            Detailed Content & Body
          </label>
          <div className="bg-white rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
            <RichTextEditor
              value={formData.content}
              onChange={(val) => setFormData({ ...formData, content: val })}
              placeholder="Write detailed post content..."
              minHeight="220px"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200 dark:border-slate-800 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-3 bg-brand-red text-white font-bold text-sm rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-brand-red/20 disabled:opacity-60 flex items-center gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'SAVING...' : isEditing ? 'UPDATE POST' : 'PUBLISH POST'}
          </button>
        </div>

      </form>
    </div>
  );
};

export default AdminBlogForm;
