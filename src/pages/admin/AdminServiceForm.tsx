import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, addDoc, updateDoc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import PhotoUpload from '../../components/admin/PhotoUpload';
import RichTextEditor from '../../components/admin/RichTextEditor';

const AdminServiceForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    image: '',
    shortDescription: '',
    content: '',
    status: 'DRAFT',
    isFeatured: false,
    iconName: 'Monitor'
  });

  useEffect(() => {
    if (isEditing && id) {
      const fetchService = async () => {
        try {
          const docRef = doc(db, 'services', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setFormData(docSnap.data() as any);
          } else {
            setError('Service not found');
          }
        } catch {
          setError('Failed to fetch service');
        } finally {
          setLoading(false);
        }
      };
      fetchService();
    }
  }, [id, isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload: any = {
        ...formData,
        updatedAt: new Date().toISOString(),
      };

      if (isEditing && id) {
        const docRef = doc(db, 'services', id);
        await updateDoc(docRef, payload);
      } else {
        payload.createdAt = new Date().toISOString();
        await addDoc(collection(db, 'services'), payload);
      }
      navigate('/admin/services');
    } catch (err) {
      console.error(err);
      setError('Failed to save service');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-brand-red h-8 w-8" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin/services" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors">
          <ArrowLeft size={16} />
          <span>Back to Services Catalog</span>
        </Link>
        <span className="text-xs text-slate-500">
          {isEditing ? `Service ID: ${id}` : 'Configure custom software & institutional service offering'}
        </span>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 dark:border-slate-800 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Service Title</label>
              <input 
                type="text" 
                name="title" 
                required
                value={formData.title}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Slug (URL friendly)</label>
              <input 
                type="text" 
                name="slug" 
                required
                value={formData.slug}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Icon Name (lucide-react)</label>
            <input 
              type="text" 
              name="iconName" 
              required
              value={formData.iconName}
              onChange={handleChange}
              className="w-full sm:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red"
              placeholder="e.g. Monitor, Paintbrush, Globe"
            />
          </div>

          <PhotoUpload
            label="Service Feature / Banner Photo"
            value={formData.image || ''}
            onChange={(url) => setFormData(prev => ({ ...prev, image: url }))}
            helpText="Upload a banner or feature illustration for this service."
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Short Description</label>
            <input 
              type="text" 
              name="shortDescription" 
              value={formData.shortDescription}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Long Content</label>
            <div className="bg-white rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
              <RichTextEditor
                value={formData.content}
                onChange={(value) => setFormData({ ...formData, content: value })}
                placeholder="Write service details and curriculum..."
                minHeight="180px"
              />
            </div>
          </div>

          <div className="flex items-center gap-8 py-4 border-t border-gray-100">
            <div className="space-y-2 flex-1">
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full sm:w-48 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red bg-white dark:bg-slate-900 dark:border-slate-800"
              >
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            
            <div className="flex items-center h-full pt-6">
              <label className="relative flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  name="isFeatured"
                  checked={formData.isFeatured}
                  onChange={handleChange}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-slate-900 dark:border-slate-800 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-red"></div>
                <span className="ml-3 text-sm font-medium text-gray-700">Featured Service</span>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-slate-950 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200">
          <Link 
            to="/admin/services"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-white transition-colors"
          >
            Cancel
          </Link>
          <button 
            type="submit" 
            disabled={saving}
            className="flex items-center gap-2 bg-brand-red text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Service'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminServiceForm;
