import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, CheckCircle2, AlertCircle, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { CMS_PAGES, fetchPageSectionOnce, savePageSection } from '../../lib/cms';
import type { EditablePageConfig } from '../../lib/cms';
import CloudinaryImageUpload from '../../components/common/CloudinaryImageUpload';

const SectionField: React.FC<{
  field: EditablePageConfig['sections'][number]['fields'][number];
  value: any;
  onChange: (value: any) => void;
}> = ({ field, value, onChange }) => {
  const base = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red';

  if (field.type === 'image') {
    return <div className="col-span-1 md:col-span-2"><CloudinaryImageUpload label={field.label} value={value || ''} onChange={onChange} helpText="Upload a high-resolution image or paste a Cloudinary URL." /></div>;
  }
  if (field.type === 'textarea') {
    return <div className="col-span-1 md:col-span-2"><label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">{field.label}</label><textarea rows={5} value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`} className={`${base} px-4 py-3 leading-6`} /></div>;
  }
  if (field.type === 'boolean') {
    return <label className="col-span-1 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800"><input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} className="h-4 w-4" /><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{field.label}</span></label>;
  }
  if (field.type === 'select') {
    return <div className="col-span-1"><label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">{field.label}</label><select value={value ?? ''} onChange={event => onChange(event.target.value)} className={`${base} min-h-11 px-4 py-3`}><option value="">Select {field.label.toLowerCase()}</option>{(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}</select></div>;
  }
  if (field.type === 'list') {
    const listValue = Array.isArray(value) ? value.join('\\n') : String(value ?? '');
    return <div className="col-span-1 md:col-span-2"><label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">{field.label}</label><textarea rows={6} value={listValue} onChange={event => onChange(event.target.value.split(/\\r?\\n/).map(item => item.trim()).filter(Boolean))} placeholder={field.placeholder || 'Enter one item per line'} className={`${base} px-4 py-3 leading-6`} /><p className="mt-1 text-[11px] text-slate-400">One item per line.</p></div>;
  }
  if (field.type === 'url') {
    return <div className="col-span-1"><label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">{field.label}</label><input type="url" value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder={field.placeholder || 'https://'} className={`${base} min-h-11 px-4 py-3`} /></div>;
  }
  return <div className="col-span-1"><label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">{field.label}</label><input type="text" value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`} className={`${base} min-h-11 px-4 py-3`} /></div>;
};

const AdminPageForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [pageConfig, setPageConfig] = useState<EditablePageConfig | null>(null);
  const [sectionData, setSectionData] = useState<Record<string, Record<string, any>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const matchedConfig = CMS_PAGES.find(p => p.id === id);
    if (!matchedConfig) {
      // Fallback for custom or unlisted pages
      const fallbackConfig: EditablePageConfig = {
        id: id || 'custom',
        title: id ? `${id.charAt(0).toUpperCase() + id.slice(1)} Page` : 'Custom Page',
        path: id === 'home' ? '/' : `/${id}`,
        description: 'Edit page contents and sections.',
        sections: [
          {
            id: 'hero',
            name: 'Hero Section',
            description: 'Main introduction section.',
            defaultData: {
              title: 'Welcome',
              subtitle: 'Empowering digital creators',
              ctaText: 'Learn More',
              ctaLink: '#',
              bannerImage: ''
            },
            fields: [
              { key: 'title', label: 'Section Title', type: 'text' },
              { key: 'subtitle', label: 'Section Subtitle', type: 'textarea' },
              { key: 'ctaText', label: 'CTA Button Text', type: 'text' },
              { key: 'ctaLink', label: 'CTA Button Link', type: 'text' },
              { key: 'bannerImage', label: 'Banner Image', type: 'image' }
            ]
          }
        ]
      };
      setPageConfig(fallbackConfig);
      initializeSectionData(fallbackConfig);
    } else {
      setPageConfig(matchedConfig);
      initializeSectionData(matchedConfig);
    }
  }, [id]);

  const initializeSectionData = async (config: EditablePageConfig) => {
    setLoading(true);
    const initialData: Record<string, Record<string, any>> = {};
    const initialOpen: Record<string, boolean> = {};

    try {
      for (const section of config.sections) {
        initialOpen[section.id] = true;
        initialData[section.id] = await fetchPageSectionOnce(config.id, section.id, section.defaultData);
      }
      setSectionData(initialData);
      setOpenSections(initialOpen);
    } catch (err) {
      console.error('Error loading section data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (sectionId: string, fieldKey: string, value: any) => {
    setSectionData(prev => ({
      ...prev,
      [sectionId]: {
        ...(prev[sectionId] || {}),
        [fieldKey]: value
      }
    }));
  };

  const toggleSection = (sectionId: string) => {
    setOpenSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pageConfig) return;

    setSaving(true);
    setMessage(null);

    try {
      // Save each section across all client databases
      for (const section of pageConfig.sections) {
        const currentData = sectionData[section.id] || section.defaultData;
        await savePageSection(pageConfig.id, section.id, currentData);
      }

      setMessage({ type: 'success', text: `All ${pageConfig.sections.length} sections on ${pageConfig.title} updated successfully!` });
    } catch (err) {
      console.error('Error saving sections:', err);
      setMessage({ type: 'error', text: 'Failed to save section changes. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !pageConfig) {
    return (
      <div className="p-20 text-center flex flex-col items-center justify-center gap-3">
        <Loader2 className="animate-spin w-8 h-8 text-brand-red" />
        <p className="text-sm font-semibold text-slate-500">Loading section editors...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Page Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <Link
            to="/admin/pages"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to Pages</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {pageConfig.title}
            </span>
            <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded">
              {pageConfig.path}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              — {pageConfig.description}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <a
            href={pageConfig.path}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-200 transition-colors"
          >
            <ExternalLink size={14} />
            Live Preview
          </a>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm font-bold ${
            message.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSaveAll} className="space-y-6">
        {pageConfig.sections.map((section, idx) => {
          const isOpen = openSections[section.id] ?? true;
          const currentValues = sectionData[section.id] || section.defaultData;

          return (
            <div
              key={section.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden"
            >
              {/* Section Header */}
              <div
                onClick={() => toggleSection(section.id)}
                className="px-6 py-4 bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-brand-red text-white flex items-center justify-center text-xs font-black">
                    {idx + 1}
                  </span>
                  <div>
                    <h2 className="text-base font-black text-brand-slate dark:text-white">
                      {section.name}
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {section.description}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                >
                  {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>

              {/* Section Fields */}
              {isOpen && (
                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {section.fields.map((field) => {
                      const value = currentValues[field.key] ?? '';
                      return <SectionField key={field.key} field={field} value={value} onChange={(nextValue) => handleFieldChange(section.id, field.key, nextValue)} />;
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Floating / Bottom Save Action */}
        <div className="sticky bottom-4 z-20 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white px-8 py-3.5 rounded-xl font-bold uppercase tracking-wider text-xs shadow-xl shadow-brand-red/30 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'SAVING SECTIONS...' : 'SAVE ALL SECTION EDITS'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminPageForm;
