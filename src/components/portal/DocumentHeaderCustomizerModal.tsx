import React, { useEffect, useState } from 'react';
import {
  X,
  Check,
  Sparkles,
  FileDown,
  Save,
  RotateCcw,
  Upload,
  Building2,
  Palette,
  LayoutTemplate,
  Mail,
  Phone,
  Globe,
  MapPin,
  Calendar,
  Type,
  Award,
  Hash,
  Sliders,
} from 'lucide-react';
import {
  DOCUMENT_HEADER_TEMPLATES,
  HEADER_COLOR_PALETTES,
  PERMANENT_COMPANY_WATERMARK,
  type DocumentHeaderConfig,
  type DocumentHeaderTemplateId,
  type DocumentHeaderFontFamily,
  getDefaultDocumentHeaderConfig,
  loadSavedDocumentHeaderConfig,
  saveDocumentHeaderConfig,
} from '../../lib/documentHeaderTemplates';
import { downloadSingleExamReportPdf } from '../../lib/examReportPdfGenerator';

interface DocumentHeaderCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  scopeKey?: string;
  schoolId?: string;
  fallbackSchoolName?: string;
  userUid?: string;
  canUpdateSchoolProfile?: boolean;
  onSaved?: (config: DocumentHeaderConfig) => void;
}

export default function DocumentHeaderCustomizerModal({
  isOpen,
  onClose,
  scopeKey = 'default',
  schoolId = '',
  fallbackSchoolName = '',
  userUid = '',
  canUpdateSchoolProfile = false,
  onSaved,
}: DocumentHeaderCustomizerModalProps) {
  const [config, setConfig] = useState<DocumentHeaderConfig>(() =>
    getDefaultDocumentHeaderConfig(
      fallbackSchoolName ? { institutionName: fallbackSchoolName } : {}
    )
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingSample, setDownloadingSample] = useState(false);
  const [keepCustomColorsOnSwitch, setKeepCustomColorsOnSwitch] = useState(false);
  const [syncToSchoolProfile, setSyncToSchoolProfile] = useState(
    Boolean(canUpdateSchoolProfile && schoolId)
  );
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    setStatusBanner(null);

    loadSavedDocumentHeaderConfig({
      scopeKey: scopeKey || schoolId || 'default',
      schoolId,
      fallbackSchoolName,
    })
      .then((loaded) => {
        if (!active) return;
        setConfig(loaded);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, scopeKey, schoolId, fallbackSchoolName]);

  if (!isOpen) return null;

  const activeTemplateMeta =
    DOCUMENT_HEADER_TEMPLATES.find((t) => t.id === config.templateId) ||
    DOCUMENT_HEADER_TEMPLATES[0];

  const handleSelectTemplate = (
    templateId: DocumentHeaderTemplateId,
    forceApplyPalette = false
  ) => {
    const meta = DOCUMENT_HEADER_TEMPLATES.find((t) => t.id === templateId);
    const shouldApplyPalette = forceApplyPalette || !keepCustomColorsOnSwitch;
    setConfig((prev) => ({
      ...prev,
      templateId,
      ...(shouldApplyPalette && meta
        ? {
            primaryColor: meta.recommendedPrimaryColor,
            accentColor: meta.recommendedAccentColor,
            fontFamily: meta.recommendedFont,
            headerTextColor: '',
          }
        : {}),
    }));
  };

  const handleLogoUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'logoDataUrl' | 'secondaryLogoDataUrl'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      setStatusBanner({
        type: 'error',
        text: 'Logo image must be under 1.5 MB for fast PDF rendering.',
      });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setConfig((prev) => ({ ...prev, [field]: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusBanner(null);
    try {
      const saved = await saveDocumentHeaderConfig(config, {
        scopeKey: scopeKey || schoolId || 'default',
        schoolId,
        updateSchoolProfile: Boolean(
          canUpdateSchoolProfile && syncToSchoolProfile && schoolId
        ),
        updatedBy: userUid,
      });
      setConfig(saved);
      onSaved?.(saved);
      setStatusBanner({
        type: 'success',
        text: 'Document header customization saved for all generated reports.',
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || 'Unable to save document header settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadSamplePdf = async () => {
    setDownloadingSample(true);
    try {
      await downloadSingleExamReportPdf(
        {
          examTitle: 'Mid-Term Robotics & Computational Thinking Evaluation',
          subject: 'Robotics & Coding',
          workType: 'EXAMINATION',
          schoolId: schoolId || 'sample-school',
          schoolName:
            config.institutionName ||
            fallbackSchoolName ||
            'Jaystarbliss Partner Academy',
          className: 'Grade 6',
          studentName: 'Sample Learner Preview',
          score: 18,
          maxScore: 20,
          percentage: 90,
          grade: 'A',
          status: 'submitted',
          releasedAt: new Date().toISOString(),
          resultReleased: true,
          submittedAt: new Date().toISOString(),
          tutorFeedback:
            'Exemplary mastery of sensor logic, autonomous loop structures, and algorithmic debugging.',
          questions: [
            {
              id: 'q1',
              prompt:
                'Which sensor measures obstacle distance using high-frequency sound waves?',
              type: 'single_choice',
              points: 10,
              options: [
                { id: 'a', text: 'Ultrasonic Distance Sensor' },
                { id: 'b', text: 'Photoresistor Light Sensor' },
              ],
              correctOptionIds: ['a'],
            },
            {
              id: 'q2',
              prompt:
                'What is the primary purpose of a conditional statement in a program?',
              type: 'single_choice',
              points: 10,
              options: [
                {
                  id: 'a',
                  text: 'To execute decisions based on whether a condition is true or false',
                },
                { id: 'b', text: 'To power down the microcontroller permanently' },
              ],
              correctOptionIds: ['a'],
            },
          ],
          answers: { q1: 'a', q2: 'a' },
          questionResults: [
            { questionId: 'q1', correct: true, pointsAwarded: 10, maxPoints: 10 },
            { questionId: 'q2', correct: true, pointsAwarded: 8, maxPoints: 10 },
          ],
          headerConfig: config,
        },
        `Sample_Header_Template_${activeTemplateMeta.number}_Preview.pdf`
      );
    } finally {
      setDownloadingSample(false);
    }
  };

  const fontCssClass =
    config.fontFamily === 'times'
      ? 'font-serif'
      : config.fontFamily === 'courier'
      ? 'font-mono'
      : 'font-sans';

  const contactSummary = [config.address, config.email, config.phone, config.website]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join('  •  ');

  const sessionDateSummary = [
    config.showAcademicSession ? config.academicSession : '',
    config.assessmentDate ? `Date: ${config.assessmentDate}` : '',
    config.showReferenceCode && config.referenceCode ? `Ref: ${config.referenceCode}` : '',
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join('   |   ');

  const effectiveReportTitle =
    config.reportTitle?.trim() || 'OFFICIAL ASSESSMENT PERFORMANCE REPORT';

  const previewLogoSrc =
    config.logoDataUrl || PERMANENT_COMPANY_WATERMARK.primaryLogoUrl;
  const previewSecondaryLogoSrc =
    config.secondaryLogoDataUrl || PERMANENT_COMPANY_WATERMARK.primaryLogoUrl;

  const logoSizeClass =
    config.logoSize === 'small'
      ? 'w-9 h-9'
      : config.logoSize === 'large'
      ? 'w-14 h-14'
      : 'w-11 h-11';

  const logoFrameClass =
    config.logoFrame === 'circle'
      ? 'rounded-full border border-slate-200/80 bg-white p-1'
      : config.logoFrame === 'square'
      ? 'rounded-none border border-slate-200/80 bg-white p-1'
      : config.logoFrame === 'clean'
      ? 'p-0.5'
      : 'rounded-lg border border-slate-200/80 bg-white p-1';

  const titleSizeClass =
    config.titleScale === 'compact'
      ? 'text-xs'
      : config.titleScale === 'grand'
      ? 'text-base'
      : 'text-sm';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Official Document Header Customizer"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Official Document Header Customizer
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Customize every detail of your institutional report header — layout, colors, typography, logos, titles, and metadata.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close Document Header Customizer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {statusBanner && (
          <div
            className={`px-6 py-2.5 text-xs font-medium flex items-center justify-between ${
              statusBanner.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 border-b border-emerald-200 dark:border-emerald-800/60'
                : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200 border-b border-rose-200 dark:border-rose-800/60'
            }`}
          >
            <span>{statusBanner.text}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-xs underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Two-Column Content */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
          {/* Left Column: 10 Templates + Complete Editable Controls */}
          <div className="lg:col-span-6 p-4 sm:p-6 space-y-6 overflow-y-auto">
            {/* Section 1: 10 Selectable Artistic Templates */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  1. Select Artistic Header Layout (10 Templates)
                </label>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepCustomColorsOnSwitch}
                    onChange={(e) => setKeepCustomColorsOnSwitch(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Keep my custom colors when switching templates
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {DOCUMENT_HEADER_TEMPLATES.map((tpl) => {
                  const selected = tpl.id === config.templateId;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tpl.id, false)}
                      className={`text-left p-3 rounded-xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                        selected
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0 mt-0.5 shadow-2xs"
                        style={{
                          background: `linear-gradient(135deg, ${tpl.recommendedPrimaryColor}, ${tpl.recommendedAccentColor})`,
                        }}
                      >
                        {tpl.number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {tpl.name}
                          </p>
                          {selected && (
                            <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                          {tpl.subtitle}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {tpl.layoutBadge}
                          </span>
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-white/60 shadow-2xs"
                            style={{ backgroundColor: tpl.recommendedPrimaryColor }}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-white/60 shadow-2xs"
                            style={{ backgroundColor: tpl.recommendedAccentColor }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Editable Institution, Titles & Metadata */}
            <div className="space-y-3.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                2. Customize Header Text, Titles & Institution Details
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    School / Institution Name
                  </label>
                  <input
                    type="text"
                    value={config.institutionName}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, institutionName: e.target.value }))
                    }
                    placeholder="e.g. Sapphire Explorer School"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Department / Faculty / Division Line
                  </label>
                  <input
                    type="text"
                    value={config.departmentOrFaculty}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        departmentOrFaculty: e.target.value,
                      }))
                    }
                    placeholder="e.g. Department of STEM, Coding & Robotics"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Motto / Institutional Tagline
                  </label>
                  <input
                    type="text"
                    value={config.tagline}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, tagline: e.target.value }))
                    }
                    placeholder="e.g. Excellence in Digital Literacy & Innovation"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Custom Report Title (Blank = Auto by Work Type)
                  </label>
                  <input
                    type="text"
                    value={config.reportTitle}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, reportTitle: e.target.value }))
                    }
                    placeholder="Auto: Official Test / Examination Performance Report"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <Award className="w-3 h-3" /> Accreditation / Verification Subtitle
                  </label>
                  <input
                    type="text"
                    value={config.accreditationNote}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        accreditationNote: e.target.value,
                      }))
                    }
                    placeholder="e.g. Verified Academic Evaluation Transcript"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Academic Session / Term
                  </label>
                  <input
                    type="text"
                    value={config.academicSession}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, academicSession: e.target.value }))
                    }
                    placeholder="e.g. 2025/2026 Academic Session"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Assessment / Issue Date
                  </label>
                  <input
                    type="text"
                    value={config.assessmentDate}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, assessmentDate: e.target.value }))
                    }
                    placeholder="e.g. 27 Oct 2026"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <Hash className="w-3 h-3" /> Document Serial / Reference Code
                  </label>
                  <input
                    type="text"
                    value={config.referenceCode}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, referenceCode: e.target.value }))
                    }
                    placeholder="e.g. JDI-REP-2026"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> School Address
                  </label>
                  <input
                    type="text"
                    value={config.address}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, address: e.target.value }))
                    }
                    placeholder="e.g. Plot 14 Academic Way, Victoria Island, Lagos"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Official Email
                  </label>
                  <input
                    type="email"
                    value={config.email}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, email: e.target.value }))
                    }
                    placeholder="info@school.edu.ng"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Contact Phone
                  </label>
                  <input
                    type="text"
                    value={config.phone}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder="+234 800 000 0000"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <Globe className="w-3 h-3" /> Website
                  </label>
                  <input
                    type="text"
                    value={config.website}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, website: e.target.value }))
                    }
                    placeholder="www.school.edu.ng"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Logos, Framing & Layout Proportions */}
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-blue-600" />
                3. Header Logos, Framing & Proportions
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                    <Upload className="w-3 h-3 text-blue-600" /> Primary School / Institution Logo
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300">
                      Upload Primary Logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => handleLogoUpload(e, 'logoDataUrl')}
                        className="hidden"
                      />
                    </label>
                    {config.logoDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({ ...prev, logoDataUrl: '' }))
                        }
                        className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Upload className="w-3 h-3 text-blue-600" /> Secondary / Right Crest
                    </label>
                    <input
                      type="checkbox"
                      checked={config.showSecondaryLogo}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          showSecondaryLogo: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-blue-600"
                      title="Show Secondary Right Crest"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300">
                      Upload Right Crest
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => handleLogoUpload(e, 'secondaryLogoDataUrl')}
                        className="hidden"
                      />
                    </label>
                    {config.secondaryLogoDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({ ...prev, secondaryLogoDataUrl: '' }))
                        }
                        className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Logo Size
                  </label>
                  <select
                    value={config.logoSize}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        logoSize: e.target.value as DocumentHeaderConfig['logoSize'],
                      }))
                    }
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="small">Compact (Small)</option>
                    <option value="medium">Standard (Balanced)</option>
                    <option value="large">Prominent (Large Crest)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Logo Frame Style
                  </label>
                  <select
                    value={config.logoFrame}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        logoFrame: e.target.value as DocumentHeaderConfig['logoFrame'],
                      }))
                    }
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="rounded">Soft Rounded Card</option>
                    <option value="circle">Circular Seal Frame</option>
                    <option value="square">Sharp Architectural Box</option>
                    <option value="clean">Transparent / Frameless</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Heading Title Scale
                  </label>
                  <select
                    value={config.titleScale}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        titleScale: e.target.value as DocumentHeaderConfig['titleScale'],
                      }))
                    }
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="compact">Compact</option>
                    <option value="standard">Standard</option>
                    <option value="grand">Grand Ceremonial</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 4: Artistic Color Studio & Typography */}
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-blue-600" />
                  4. Artistic Color Studio & Typography
                </label>
                <button
                  type="button"
                  onClick={() => handleSelectTemplate(config.templateId, true)}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                >
                  Reset to Template Colors
                </button>
              </div>

              {/* Curated Color Palettes */}
              <div className="flex flex-wrap gap-1.5">
                {HEADER_COLOR_PALETTES.map((pal) => {
                  const isMatch =
                    config.primaryColor.toLowerCase() === pal.primaryColor.toLowerCase() &&
                    config.accentColor.toLowerCase() === pal.accentColor.toLowerCase();
                  return (
                    <button
                      key={pal.id}
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          primaryColor: pal.primaryColor,
                          accentColor: pal.accentColor,
                        }))
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                        isMatch
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-white/60"
                        style={{ backgroundColor: pal.primaryColor }}
                      />
                      <span
                        className="w-3 h-3 rounded-full border border-white/60 -ml-1"
                        style={{ backgroundColor: pal.accentColor }}
                      />
                      <span>{pal.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Primary Color
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={config.primaryColor}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, primaryColor: e.target.value }))
                      }
                      className="w-8 h-8 rounded cursor-pointer border border-slate-300 shrink-0"
                    />
                    <input
                      type="text"
                      value={config.primaryColor}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, primaryColor: e.target.value }))
                      }
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Accent Color
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={config.accentColor}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, accentColor: e.target.value }))
                      }
                      className="w-8 h-8 rounded cursor-pointer border border-slate-300 shrink-0"
                    />
                    <input
                      type="text"
                      value={config.accentColor}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, accentColor: e.target.value }))
                      }
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Title Text Color
                    </label>
                    {config.headerTextColor && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({ ...prev, headerTextColor: '' }))
                        }
                        className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                      >
                        Auto
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={config.headerTextColor || config.primaryColor}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          headerTextColor: e.target.value,
                        }))
                      }
                      className="w-8 h-8 rounded cursor-pointer border border-slate-300 shrink-0"
                    />
                    <input
                      type="text"
                      value={config.headerTextColor || 'Auto'}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          headerTextColor: e.target.value,
                        }))
                      }
                      placeholder="Auto"
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <Type className="w-3 h-3" /> Font Family
                  </label>
                  <select
                    value={config.fontFamily}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        fontFamily: e.target.value as DocumentHeaderFontFamily,
                      }))
                    }
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="helvetica">Helvetica (Sans)</option>
                    <option value="times">Times (Academic Serif)</option>
                    <option value="courier">Courier (Technical)</option>
                  </select>
                </div>
              </div>

              {/* Visibility Toggles */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showDepartment}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, showDepartment: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Show Department Line
                </label>

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showMotto}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, showMotto: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Show Motto / Tagline
                </label>

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showContactRow}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, showContactRow: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Show Contact Row
                </label>

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showAcademicSession}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        showAcademicSession: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Show Academic Session
                </label>

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showReferenceCode}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        showReferenceCode: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Show Serial / Ref Code
                </label>

                {canUpdateSchoolProfile && schoolId && schoolId !== 'private' && (
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncToSchoolProfile}
                      onChange={(e) => setSyncToSchoolProfile(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    Save as Default Header for School Profile
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive A4 Document Preview */}
          <div className="lg:col-span-6 p-4 sm:p-6 bg-slate-100/80 dark:bg-slate-950/60 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Live A4 Header Preview — Template #{activeTemplateMeta.number}:{' '}
                  {activeTemplateMeta.name}
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Every header change updates in real time.
                </p>
              </div>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold text-white shadow-2xs"
                style={{
                  background: `linear-gradient(135deg, ${config.primaryColor}, ${config.accentColor})`,
                }}
              >
                {activeTemplateMeta.layoutBadge}
              </span>
            </div>

            {/* Simulated A4 Sheet */}
            <div
              className={`relative flex-1 bg-white text-slate-900 rounded-xl shadow-lg border border-slate-300 overflow-hidden flex flex-col justify-between min-h-[480px] ${fontCssClass}`}
            >
              {/* Permanent Centered Transparent JayStar Bliss Logo Watermark */}
              <div
                className="pointer-events-none select-none absolute inset-0 flex items-center justify-center z-0"
                aria-hidden="true"
              >
                <img
                  src={PERMANENT_COMPANY_WATERMARK.primaryLogoUrl}
                  onError={(e) => {
                    e.currentTarget.src = PERMANENT_COMPANY_WATERMARK.fallbackLogoUrl;
                  }}
                  alt=""
                  className="w-64 h-64 object-contain opacity-[0.085]"
                />
              </div>

              {/* Dynamic Artistic Header Preview matching selected template */}
              <div className="relative z-10">
                {config.templateId === 'modern-executive' && (
                  <div
                    className="bg-slate-50/95 border-b-4 p-4 flex items-start justify-between gap-3"
                    style={{
                      borderLeft: `6px solid ${config.primaryColor}`,
                      borderBottomColor: config.accentColor,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={previewLogoSrc}
                        alt="Logo"
                        className={`${logoSizeClass} object-contain shrink-0 ${logoFrameClass}`}
                      />
                      <div>
                        <h3
                          className={`${titleSizeClass} font-extrabold uppercase tracking-tight`}
                          style={{
                            color: config.headerTextColor || config.primaryColor,
                          }}
                        >
                          {config.institutionName || 'Institution Name'}
                        </h3>
                        {config.showDepartment && config.departmentOrFaculty && (
                          <p
                            className="text-[11px] font-bold"
                            style={{ color: config.accentColor }}
                          >
                            {config.departmentOrFaculty}
                          </p>
                        )}
                        {config.showMotto && config.tagline && (
                          <p className="text-[11px] text-slate-600">{config.tagline}</p>
                        )}
                        <p
                          className="text-xs font-extrabold uppercase mt-1 tracking-wide"
                          style={{ color: config.accentColor }}
                        >
                          {effectiveReportTitle}
                        </p>
                        {config.accreditationNote && (
                          <p className="text-[10px] italic text-slate-500">
                            {config.accreditationNote}
                          </p>
                        )}
                        {config.showContactRow && contactSummary && (
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {contactSummary}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      {config.showSecondaryLogo && (
                        <img
                          src={previewSecondaryLogoSrc}
                          alt="Secondary Crest"
                          className="w-9 h-9 object-contain rounded bg-white p-0.5 border border-slate-200"
                        />
                      )}
                      {config.showAcademicSession && config.academicSession && (
                        <span
                          className="inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-md"
                          style={{
                            backgroundColor: `${config.primaryColor}15`,
                            color: config.primaryColor,
                          }}
                        >
                          {config.academicSession}
                        </span>
                      )}
                      <p className="text-[10px] text-slate-500">
                        Date: {config.assessmentDate}
                      </p>
                      {config.showReferenceCode && config.referenceCode && (
                        <p className="text-[9px] font-mono text-slate-500">
                          Ref: {config.referenceCode}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {config.templateId === 'royal-centered' && (
                  <div className="pt-3 pb-3 px-4 text-center border-b border-slate-200 bg-gradient-to-b from-slate-50/90 to-white">
                    <div
                      className="h-1.5 w-full mb-2.5 rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${config.primaryColor}, ${config.accentColor}, ${config.primaryColor})`,
                      }}
                    />
                    <img
                      src={previewLogoSrc}
                      alt="Crest"
                      className={`${logoSizeClass} object-contain mx-auto mb-1.5 ${logoFrameClass}`}
                    />
                    <h3
                      className={`${titleSizeClass} font-extrabold uppercase tracking-wide`}
                      style={{
                        color: config.headerTextColor || config.primaryColor,
                      }}
                    >
                      {config.institutionName}
                    </h3>
                    {config.showDepartment && config.departmentOrFaculty && (
                      <p
                        className="text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: config.accentColor }}
                      >
                        {config.departmentOrFaculty}
                      </p>
                    )}
                    {config.showMotto && config.tagline && (
                      <p className="text-[11px] italic text-slate-600">{config.tagline}</p>
                    )}
                    {config.showContactRow && contactSummary && (
                      <p className="text-[10px] text-slate-500 mt-0.5">{contactSummary}</p>
                    )}
                    <div
                      className="mt-2 py-1 px-4 rounded-full text-white text-[11px] font-bold uppercase tracking-wide inline-block shadow-2xs"
                      style={{ backgroundColor: config.accentColor }}
                    >
                      {effectiveReportTitle}
                      {sessionDateSummary ? `  •  ${sessionDateSummary}` : ''}
                    </div>
                  </div>
                )}

                {config.templateId === 'minimalist-swiss' && (
                  <div className="p-4">
                    <div
                      className="flex items-center gap-3 pb-2.5 border-b-2"
                      style={{ borderColor: config.primaryColor }}
                    >
                      <img
                        src={previewLogoSrc}
                        alt="Logo"
                        className={`${logoSizeClass} object-contain ${logoFrameClass}`}
                      />
                      <div className="flex-1">
                        <h3
                          className={`${titleSizeClass} font-extrabold uppercase tracking-tight`}
                          style={{
                            color: config.headerTextColor || config.primaryColor,
                          }}
                        >
                          {config.institutionName}
                        </h3>
                        {config.showDepartment && config.departmentOrFaculty && (
                          <p className="text-[11px] font-semibold text-slate-700">
                            {config.departmentOrFaculty}
                          </p>
                        )}
                        {config.showMotto && config.tagline && (
                          <p className="text-[11px] text-slate-500">{config.tagline}</p>
                        )}
                        {config.showContactRow && contactSummary && (
                          <p className="text-[10px] text-slate-400">{contactSummary}</p>
                        )}
                      </div>
                      {config.showSecondaryLogo && (
                        <img
                          src={previewSecondaryLogoSrc}
                          alt="Secondary"
                          className="w-10 h-10 object-contain"
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 text-[11px] border-b border-slate-200 pb-1.5">
                      <span
                        className="font-extrabold uppercase tracking-wider"
                        style={{ color: config.accentColor }}
                      >
                        {effectiveReportTitle}
                      </span>
                      <span className="text-slate-500 font-medium">
                        {sessionDateSummary}
                      </span>
                    </div>
                  </div>
                )}

                {config.templateId === 'academic-seal' && (
                  <div className="p-4 text-center bg-amber-50/20">
                    <div className="flex items-center justify-between gap-3">
                      <img
                        src={previewLogoSrc}
                        alt="Left Seal"
                        className={`${logoSizeClass} object-contain ${logoFrameClass}`}
                      />
                      <div className="flex-1">
                        <h3
                          className={`${titleSizeClass} font-extrabold uppercase tracking-wide`}
                          style={{
                            color: config.headerTextColor || config.primaryColor,
                          }}
                        >
                          {config.institutionName}
                        </h3>
                        {config.showDepartment && config.departmentOrFaculty && (
                          <p
                            className="text-[11px] font-bold"
                            style={{ color: config.accentColor }}
                          >
                            {config.departmentOrFaculty}
                          </p>
                        )}
                        {config.showMotto && config.tagline && (
                          <p className="text-[11px] italic text-slate-600">
                            {config.tagline}
                          </p>
                        )}
                        {config.showContactRow && contactSummary && (
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {contactSummary}
                          </p>
                        )}
                      </div>
                      <img
                        src={previewSecondaryLogoSrc}
                        alt="Right Seal"
                        className={`${logoSizeClass} object-contain ${logoFrameClass}`}
                      />
                    </div>
                    <div
                      className="mt-2.5 border-t-2 border-b py-1 px-2 flex items-center justify-between text-[11px]"
                      style={{ borderColor: config.primaryColor }}
                    >
                      <span
                        className="font-bold uppercase"
                        style={{ color: config.accentColor }}
                      >
                        {effectiveReportTitle}
                      </span>
                      <span className="text-slate-600">{sessionDateSummary}</span>
                    </div>
                  </div>
                )}

                {config.templateId === 'tech-institute' && (
                  <div
                    className="p-4 text-white border-b-4"
                    style={{
                      backgroundColor: config.primaryColor,
                      borderBottomColor: config.accentColor,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={previewLogoSrc}
                        alt="Logo"
                        className={`${logoSizeClass} object-contain bg-white/95 p-1 rounded-lg`}
                      />
                      <div className="flex-1">
                        <h3
                          className={`${titleSizeClass} font-extrabold uppercase tracking-wider`}
                          style={{ color: config.headerTextColor || '#FFFFFF' }}
                        >
                          {config.institutionName}
                        </h3>
                        {config.showDepartment && config.departmentOrFaculty && (
                          <p
                            className="text-[11px] font-bold"
                            style={{ color: config.accentColor }}
                          >
                            {config.departmentOrFaculty}
                          </p>
                        )}
                        {config.showMotto && config.tagline && (
                          <p className="text-[11px] text-sky-100">{config.tagline}</p>
                        )}
                        {config.showContactRow && contactSummary && (
                          <p className="text-[10px] text-slate-200 mt-0.5">
                            {contactSummary}
                          </p>
                        )}
                      </div>
                      {config.showSecondaryLogo && (
                        <img
                          src={previewSecondaryLogoSrc}
                          alt="Secondary"
                          className="w-10 h-10 object-contain bg-white/95 p-1 rounded-lg"
                        />
                      )}
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-white/20 flex items-center justify-between text-[11px]">
                      <span className="font-bold tracking-wide">
                        [ {effectiveReportTitle} ]
                      </span>
                      <span className="text-sky-100">{sessionDateSummary}</span>
                    </div>
                  </div>
                )}

                {config.templateId === 'split-card-banner' && (
                  <div className="p-3">
                    <div
                      className="rounded-xl border-2 overflow-hidden shadow-2xs"
                      style={{ borderColor: config.primaryColor }}
                    >
                      <div className="p-3 flex items-center justify-between gap-3 bg-white">
                        <div className="flex items-center gap-3">
                          <img
                            src={previewLogoSrc}
                            alt="Logo"
                            className={`${logoSizeClass} object-contain ${logoFrameClass}`}
                          />
                          <div>
                            <h3
                              className={`${titleSizeClass} font-extrabold uppercase`}
                              style={{
                                color: config.headerTextColor || config.primaryColor,
                              }}
                            >
                              {config.institutionName}
                            </h3>
                            {config.showDepartment && config.departmentOrFaculty && (
                              <p
                                className="text-[11px] font-bold"
                                style={{ color: config.accentColor }}
                              >
                                {config.departmentOrFaculty}
                              </p>
                            )}
                            {config.showMotto && config.tagline && (
                              <p className="text-[11px] text-slate-600">
                                {config.tagline}
                              </p>
                            )}
                            <p
                              className="text-[11px] font-extrabold mt-0.5 uppercase"
                              style={{ color: config.accentColor }}
                            >
                              {effectiveReportTitle}
                            </p>
                          </div>
                        </div>
                        {config.showSecondaryLogo && (
                          <img
                            src={previewSecondaryLogoSrc}
                            alt="Crest"
                            className="w-10 h-10 object-contain"
                          />
                        )}
                      </div>
                      <div
                        className="px-3 py-1.5 text-[10px] font-medium text-white text-center"
                        style={{ backgroundColor: config.primaryColor }}
                      >
                        {[contactSummary, sessionDateSummary]
                          .filter(Boolean)
                          .join('   |   ')}
                      </div>
                    </div>
                  </div>
                )}

                {config.templateId === 'compact-official' && (
                  <div
                    className="px-4 py-2.5 text-white flex items-center justify-between gap-3 border-b-4"
                    style={{
                      backgroundColor: config.primaryColor,
                      borderBottomColor: config.accentColor,
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={previewLogoSrc}
                        alt="Logo"
                        className="w-10 h-10 object-contain bg-white rounded-lg p-0.5"
                      />
                      <div>
                        <h3
                          className={`${titleSizeClass} font-extrabold uppercase`}
                          style={{ color: config.headerTextColor || '#FFFFFF' }}
                        >
                          {config.institutionName}
                        </h3>
                        <p className="text-[10px] text-slate-200">
                          {config.showDepartment && config.departmentOrFaculty
                            ? `${config.departmentOrFaculty}  •  ${
                                contactSummary || config.tagline
                              }`
                            : contactSummary || config.tagline}
                        </p>
                        <p className="text-[10px] font-bold uppercase mt-0.5 text-amber-200">
                          {effectiveReportTitle}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-[10px] text-slate-100 shrink-0">
                      {sessionDateSummary}
                    </div>
                  </div>
                )}

                {config.templateId === 'prestige-gold' && (
                  <div className="p-3" style={{ backgroundColor: config.primaryColor }}>
                    <div
                      className="border-2 p-3 text-center text-white rounded-lg"
                      style={{ borderColor: config.accentColor }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <img
                          src={previewLogoSrc}
                          alt="Crest"
                          className="w-11 h-11 object-contain bg-white/95 rounded-lg p-0.5"
                        />
                        <div className="flex-1">
                          <h3
                            className={`${titleSizeClass} font-extrabold uppercase tracking-wide`}
                            style={{ color: config.headerTextColor || '#FFFFFF' }}
                          >
                            {config.institutionName}
                          </h3>
                          {config.showDepartment && config.departmentOrFaculty && (
                            <p
                              className="text-[11px] font-bold"
                              style={{ color: config.accentColor }}
                            >
                              {config.departmentOrFaculty}
                            </p>
                          )}
                          {config.showMotto && config.tagline && (
                            <p className="text-[11px] italic text-amber-200">
                              {config.tagline}
                            </p>
                          )}
                          {config.showContactRow && contactSummary && (
                            <p className="text-[10px] text-slate-200">{contactSummary}</p>
                          )}
                        </div>
                        <img
                          src={previewSecondaryLogoSrc}
                          alt="Right Seal"
                          className="w-11 h-11 object-contain bg-white/95 rounded-lg p-0.5"
                        />
                      </div>
                      <p className="text-[11px] font-bold uppercase mt-1.5 pt-1 border-t border-white/20">
                        {effectiveReportTitle}
                        {sessionDateSummary ? `  •  ${sessionDateSummary}` : ''}
                      </p>
                    </div>
                  </div>
                )}

                {config.templateId === 'global-standard' && (
                  <div className="p-3">
                    <div
                      className="border-2 grid grid-cols-12 overflow-hidden rounded-lg"
                      style={{ borderColor: config.primaryColor }}
                    >
                      <div
                        className="col-span-8 p-2.5 border-r-2"
                        style={{ borderColor: config.primaryColor }}
                      >
                        <div className="flex items-center gap-2.5">
                          <img
                            src={previewLogoSrc}
                            alt="Logo"
                            className={`${logoSizeClass} object-contain ${logoFrameClass}`}
                          />
                          <div>
                            <h3
                              className={`${titleSizeClass} font-extrabold uppercase`}
                              style={{
                                color: config.headerTextColor || config.primaryColor,
                              }}
                            >
                              {config.institutionName}
                            </h3>
                            {config.showDepartment && config.departmentOrFaculty && (
                              <p
                                className="text-[10px] font-bold"
                                style={{ color: config.accentColor }}
                              >
                                {config.departmentOrFaculty}
                              </p>
                            )}
                            {config.showMotto && config.tagline && (
                              <p className="text-[10px] text-slate-600">
                                {config.tagline}
                              </p>
                            )}
                            {config.showContactRow && contactSummary && (
                              <p className="text-[9px] text-slate-500 mt-0.5">
                                {contactSummary}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-4 p-2.5 bg-slate-50 flex flex-col justify-center text-[10px]">
                        <span
                          className="font-bold uppercase"
                          style={{ color: config.accentColor }}
                        >
                          {effectiveReportTitle}
                        </span>
                        {config.showAcademicSession && (
                          <span className="text-slate-600 mt-0.5">
                            {config.academicSession}
                          </span>
                        )}
                        <span className="text-slate-500">
                          Date: {config.assessmentDate}
                        </span>
                        {config.showReferenceCode && config.referenceCode && (
                          <span className="text-slate-500 font-mono text-[9px]">
                            Ref: {config.referenceCode}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {config.templateId === 'classic-crest' && (
                  <div>
                    <div
                      className="h-2.5 w-full"
                      style={{
                        background: `linear-gradient(90deg, ${config.primaryColor} 65%, ${config.accentColor} 35%)`,
                      }}
                    />
                    <div className="p-3.5 text-center border-b border-slate-200">
                      <img
                        src={previewLogoSrc}
                        alt="Logo"
                        className={`${logoSizeClass} object-contain mx-auto mb-1 ${logoFrameClass}`}
                      />
                      <h3
                        className={`${titleSizeClass} font-extrabold uppercase`}
                        style={{
                          color: config.headerTextColor || config.primaryColor,
                        }}
                      >
                        {config.institutionName}
                      </h3>
                      {config.showDepartment && config.departmentOrFaculty && (
                        <p
                          className="text-[11px] font-bold"
                          style={{ color: config.accentColor }}
                        >
                          {config.departmentOrFaculty}
                        </p>
                      )}
                      {config.showMotto && config.tagline && (
                        <p className="text-[11px] text-slate-600">{config.tagline}</p>
                      )}
                      {config.showContactRow && contactSummary && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {contactSummary}
                        </p>
                      )}
                      <div className="mt-2 pt-1.5 border-t border-slate-200 flex items-center justify-between text-[11px]">
                        <span
                          className="font-bold uppercase"
                          style={{ color: config.accentColor }}
                        >
                          {effectiveReportTitle}
                        </span>
                        <span className="text-slate-500">{sessionDateSummary}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Simulated Student Report Body inside Preview */}
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-2 bg-slate-50/90 border border-slate-200 rounded-lg p-2.5 text-[11px]">
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">
                        Candidate Name
                      </span>
                      <span className="font-bold text-slate-800">
                        Sample Learner Preview
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">
                        Class / Grade
                      </span>
                      <span className="font-bold text-slate-800">
                        Grade 6 • Robotics
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">
                        Final Score & Grade
                      </span>
                      <span
                        className="font-extrabold"
                        style={{ color: config.primaryColor }}
                      >
                        18 / 20 (90% — Grade A)
                      </span>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-hidden text-[11px]">
                    <div
                      className="px-3 py-1.5 text-white font-bold flex justify-between"
                      style={{ backgroundColor: config.primaryColor }}
                    >
                      <span>Question Breakdown Preview</span>
                      <span>Marks</span>
                    </div>
                    <div className="divide-y divide-slate-200 bg-white/80">
                      <div className="px-3 py-2 flex justify-between">
                        <span>
                          Q1. Ultrasonic distance sensor principle & wave reflection
                        </span>
                        <span className="font-bold text-emerald-700">10 / 10</span>
                      </div>
                      <div className="px-3 py-2 flex justify-between">
                        <span>
                          Q2. Conditional logic & autonomous loop termination
                        </span>
                        <span className="font-bold text-emerald-700">8 / 10</span>
                      </div>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/70 text-[10px]">
                    <span
                      className="font-bold uppercase block mb-0.5"
                      style={{ color: config.primaryColor }}
                    >
                      Official Tutor Remark:
                    </span>
                    <span className="text-slate-700 italic">
                      &ldquo;Exemplary mastery of sensor logic, autonomous loop structures, and algorithmic debugging.&rdquo;
                    </span>
                  </div>
                </div>
              </div>

              {/* Simulated Page Footer */}
              <div className="relative z-10 px-4 py-2 border-t border-slate-200 bg-slate-50/90 flex items-center justify-between text-[9px] text-slate-500">
                <span>
                  {config.institutionName || 'Official Assessment Document'} •{' '}
                  {config.accreditationNote || 'Verified Performance Transcript'}
                </span>
                <span>Page 1 of 1</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Action Bar */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              setConfig(
                getDefaultDocumentHeaderConfig(
                  fallbackSchoolName ? { institutionName: fallbackSchoolName } : {}
                )
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Defaults
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadSamplePdf}
              disabled={downloadingSample || loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-blue-600/30 bg-blue-50/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60 disabled:opacity-50 cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              {downloadingSample ? 'Generating Sample PDF...' : 'Download Sample PDF'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving Header...' : 'Save & Apply Header'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
