import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, addDoc, updateDoc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArrowLeft, Loader2, Gamepad2, Briefcase } from 'lucide-react';
import RichTextEditor from '../../components/admin/RichTextEditor';
import PhotoUpload from '../../components/admin/PhotoUpload';

const presetIcons = ['gamepad', 'rocket', 'code', 'palette', 'cpu', 'terminal', 'sparkles'];

const AdminPortfolioForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    portfolioType: 'STUDENT_WORK', // 'STUDENT_WORK' (Kids Corner) or 'CLIENT_WORK' (Organisation)
    client: '',
    studentName: '',
    studentAge: '',
    icon: 'gamepad',
    category: '',
    description: '',
    embedUrl: '',
    liveUrl: '',
    featuredImage: '',
    status: 'PUBLISHED',
    isFeatured: false
  });

  useEffect(() => {
    if (isEditing && id) {
      getDoc(doc(db, 'portfolio', id)).then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          setFormData({
            title: data.title || '',
            slug: data.slug || '',
            portfolioType: data.portfolioType || 'STUDENT_WORK',
            client: data.client || '',
            studentName: data.studentName || '',
            studentAge: data.studentAge || '',
            icon: data.icon || 'gamepad',
            category: data.category || '',
            description: data.description || '',
            embedUrl: data.embedUrl || '',
            liveUrl: data.liveUrl || '',
            featuredImage: data.featuredImage || '',
            status: data.status || 'PUBLISHED',
            isFeatured: Boolean(data.isFeatured)
          });
        }
        setLoading(false);
      }).catch(err => {
        console.error(err);
        setError('Failed to load project details.');
        setLoading(false);
      });
    }
  }, [id, isEditing]);

  const handleChange = (e: any) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const name = e.target.name;

    // Auto-generate slug from title if new
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
      const data: any = {
        ...formData,
        updatedAt: new Date().toISOString()
      };

      if (!isEditing) {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db, 'portfolio'), data);
      } else {
        await updateDoc(doc(db, 'portfolio', id!), data);
      }

      navigate('/admin/portfolio');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-16 flex justify-center items-center">
        <Loader2 className="animate-spin text-brand-red" size={32} />
      </div>
    );
  }

  const isKidsCorner = formData.portfolioType === 'STUDENT_WORK' || formData.portfolioType === 'KIDS_CORNER';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin/portfolio" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
          <ArrowLeft size={16} />
          <span>Back to Portfolio Showcase</span>
        </Link>
        <p className="text-xs text-slate-500">
          {isEditing ? 'Editing project details for the website showcase.' : 'Configure new project or student game showcase details.'}
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 dark:border-slate-800 rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 space-y-6">
        
        {/* Section Picker */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
            Target Section *
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, portfolioType: 'STUDENT_WORK', category: formData.category || 'Arcade Game' })}
              className={`p-4 rounded-xl border-2 flex items-center gap-3 transition-all text-left ${
                isKidsCorner
                  ? 'border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-300 shadow-sm'
                  : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 text-gray-700 dark:text-gray-300'
              }`}
            >
              <Gamepad2 className={isKidsCorner ? 'text-amber-500' : 'text-gray-400'} size={24} />
              <div>
                <div className="font-bold text-sm">Kids Corner & Game World</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Playable student games & Scratch creations</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setFormData({ ...formData, portfolioType: 'CLIENT_WORK', category: formData.category || 'Web Application' })}
              className={`p-4 rounded-xl border-2 flex items-center gap-3 transition-all text-left ${
                !isKidsCorner
                  ? 'border-brand-red bg-brand-red/10 text-slate-900 dark:text-white shadow-sm'
                  : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 text-gray-700 dark:text-gray-300'
              }`}
            >
              <Briefcase className={!isKidsCorner ? 'text-brand-red' : 'text-gray-400'} size={24} />
              <div>
                <div className="font-bold text-sm">Organisation Project</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Client solutions, portals & enterprise apps</div>
              </div>
            </button>
          </div>
        </div>

        {/* Title and Slug */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
              Project Title *
            </label>
            <input
              type="text"
              name="title"
              required
              value={formData.title}
              onChange={handleChange}
              placeholder={isKidsCorner ? "e.g. Funfinity, Dino Run..." : "e.g. School Innovation Portal..."}
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-red"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
              Category
            </label>
            <input
              type="text"
              name="category"
              value={formData.category}
              onChange={handleChange}
              placeholder={isKidsCorner ? "e.g. Multi-Game Arena, Action Defense, Math App" : "e.g. EdTech Platform, Mobile App"}
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-red"
            />
          </div>
        </div>

        {/* Conditional Fields: Kids Corner */}
        {isKidsCorner && (
          <div className="bg-amber-50/50 dark:bg-amber-950/20 p-5 rounded-2xl border border-amber-200 dark:border-amber-900/50 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider">
              <Gamepad2 size={16} /> Kids Corner Specific Details
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Student Creator Name *
                </label>
                <input
                  type="text"
                  name="studentName"
                  value={formData.studentName}
                  onChange={handleChange}
                  placeholder="e.g. Sarah_playzcraft, Nel-jdn, David O."
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Student Age
                </label>
                <input
                  type="text"
                  name="studentAge"
                  value={formData.studentAge}
                  onChange={handleChange}
                  placeholder="e.g. 11, 13"
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm"
                />
              </div>
            </div>

            {/* Icon Selection */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                Game Theme Icon Tag
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  name="icon"
                  value={formData.icon}
                  onChange={handleChange}
                  placeholder="e.g. gamepad, rocket, code"
                  className="w-36 px-3 py-1.5 text-xs font-semibold border border-gray-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {presetIcons.map(ic => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon: ic })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase transition-all ${
                        formData.icon === ic ? 'bg-amber-500 text-slate-950 shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Embed Iframe URL */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
                <span>Scratch / Game Embed Iframe URL</span>
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-normal">e.g. https://scratch.mit.edu/projects/1236660351/embed</span>
              </label>
              <input
                type="url"
                name="embedUrl"
                value={formData.embedUrl}
                onChange={handleChange}
                placeholder="https://scratch.mit.edu/projects/[PROJECT_ID]/embed"
                className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm font-mono"
              />
            </div>
          </div>
        )}

        {/* Conditional Fields: Organisation */}
        {!isKidsCorner && (
          <div className="bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              <Briefcase size={16} className="text-brand-red" /> Organisation Client Info
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Client / Organization Partner Name
              </label>
              <input
                type="text"
                name="client"
                value={formData.client}
                onChange={handleChange}
                placeholder="e.g. Ministry of Education, Lekki Tech Hub, Internal Product"
                className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm"
              />
            </div>
          </div>
        )}

        {/* Live URL */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
            Live URL / Scratch Project Link
          </label>
          <input
            type="url"
            name="liveUrl"
            value={formData.liveUrl}
            onChange={handleChange}
            placeholder="https://scratch.mit.edu/projects/... or https://domain.com"
            className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-red text-sm"
          />
        </div>

        {/* Featured Photo Upload */}
        <PhotoUpload
          label="Project Cover / Screenshot Photo"
          value={formData.featuredImage}
          onChange={(url) => setFormData(prev => ({ ...prev, featuredImage: url }))}
          helpText="Upload a clear screenshot or banner photo for this project."
        />

        {/* Description Rich Text */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
            Project Description & Instructions
          </label>
          <div className="bg-white rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
            <RichTextEditor
              value={formData.description}
              onChange={(val) => setFormData({ ...formData, description: val })}
              placeholder="Write project description and instructions..."
              minHeight="180px"
            />
          </div>
        </div>

        {/* Status & Featured */}
        <div className="flex flex-wrap items-center justify-between gap-6 pt-4 border-t border-gray-200 dark:border-slate-800">
          <div className="flex items-center gap-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="px-4 py-2 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-sm font-bold"
              >
                <option value="PUBLISHED">Published (Visible on Website)</option>
                <option value="DRAFT">Draft (Hidden)</option>
              </select>
            </div>

            <div className="pt-5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="isFeatured"
                  checked={formData.isFeatured}
                  onChange={handleChange}
                  className="w-5 h-5 rounded text-brand-red accent-brand-red"
                />
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  Feature on Spotlight
                </span>
              </label>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-8 py-3 bg-brand-red text-white font-bold text-sm rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-brand-red/20 disabled:opacity-60 flex items-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'SAVING...' : isEditing ? 'UPDATE PROJECT' : 'PUBLISH PROJECT'}
            </button>
          </div>
        </div>

      </form>
    </div>
  );
};

export default AdminPortfolioForm;
