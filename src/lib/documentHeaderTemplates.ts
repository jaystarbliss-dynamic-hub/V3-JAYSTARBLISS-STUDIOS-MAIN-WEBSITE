import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type DocumentHeaderTemplateId =
  | 'classic-crest'
  | 'modern-executive'
  | 'royal-centered'
  | 'minimalist-swiss'
  | 'academic-seal'
  | 'tech-institute'
  | 'split-card-banner'
  | 'compact-official'
  | 'prestige-gold'
  | 'global-standard';

export type DocumentHeaderFontFamily = 'helvetica' | 'times' | 'courier';
export type DocumentHeaderLogoPosition = 'left' | 'center' | 'right' | 'dual';
export type DocumentHeaderLogoSize = 'small' | 'medium' | 'large';
export type DocumentHeaderLogoFrame = 'rounded' | 'circle' | 'square' | 'clean';
export type DocumentHeaderTitleScale = 'compact' | 'standard' | 'grand';
export type DocumentHeaderAlignment = 'auto' | 'left' | 'center' | 'right';
export type DocumentHeaderBgStyle = 'template-default' | 'solid' | 'soft-tint' | 'clean-white';

export interface DocumentHeaderConfig {
  templateId: DocumentHeaderTemplateId;
  institutionName: string;
  departmentOrFaculty: string;
  tagline: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  academicSession: string;
  assessmentDate: string;
  reportTitle: string;
  reportSubtitle: string;
  referenceCode: string;
  accreditationNote: string;
  logoDataUrl: string;
  secondaryLogoDataUrl: string;
  showSecondaryLogo: boolean;
  logoPosition: DocumentHeaderLogoPosition;
  logoSize: DocumentHeaderLogoSize;
  logoFrame: DocumentHeaderLogoFrame;
  primaryColor: string;
  accentColor: string;
  headerTextColor: string;
  headerBgStyle: DocumentHeaderBgStyle;
  fontFamily: DocumentHeaderFontFamily;
  titleScale: DocumentHeaderTitleScale;
  headerAlignment: DocumentHeaderAlignment;
  showMotto: boolean;
  showDepartment: boolean;
  showContactRow: boolean;
  showAcademicSession: boolean;
  showReferenceCode: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface DocumentHeaderTemplateMeta {
  id: DocumentHeaderTemplateId;
  number: number;
  name: string;
  subtitle: string;
  description: string;
  recommendedPrimaryColor: string;
  recommendedAccentColor: string;
  recommendedFont: DocumentHeaderFontFamily;
  layoutBadge: string;
}

export interface HeaderColorPalettePreset {
  id: string;
  name: string;
  primaryColor: string;
  accentColor: string;
  headerTextColor?: string;
}

export interface TutorRemarkPreset {
  id: string;
  category: 'Distinction' | 'Commendable' | 'Satisfactory' | 'Support Needed' | 'General';
  label: string;
  text: string;
}

/**
 * Centralized, non-removable company watermark specification for JayStar Bliss Studios.
 * Uses the transparent PNG at /assets/FINAL_LOGO_JDI-removebg-preview.png.
 * This configuration is mandatory across all generated PDFs and previews and cannot
 * be edited or removed by users or schools.
 */
export const PERMANENT_COMPANY_WATERMARK = Object.freeze({
  companyName: 'JAYSTARBLISS STUDIOS',
  subBrand: 'JAYSTARBLISS DYNAMIC INNOVATIONS',
  sealCaption: 'AUTHENTICATED ACADEMIC ASSESSMENT & TRANSCRIPT RECORD',
  primaryLogoUrl: '/assets/FINAL_LOGO_JDI-removebg-preview.png',
  fallbackLogoUrl: '/FINAL_LOGO_JDI-removebg-preview.png',
  secondaryFallbackUrl: '/logo-watermark.png',
  opacity: 0.085,
  scaleRatio: 0.56,
  enforceOnAllPages: true,
});

export const HEADER_COLOR_PALETTES: HeaderColorPalettePreset[] = [
  { id: 'royal-sapphire', name: 'Royal Sapphire & Gold', primaryColor: '#1e3a8a', accentColor: '#d97706' },
  { id: 'oxford-crimson', name: 'Oxford Navy & Crimson', primaryColor: '#14284b', accentColor: '#b91c1c' },
  { id: 'emerald-academy', name: 'Emerald Academy', primaryColor: '#065f46', accentColor: '#10b981' },
  { id: 'imperial-plum', name: 'Imperial Plum & Amber', primaryColor: '#3b0764', accentColor: '#f59e0b' },
  { id: 'slate-cyber', name: 'STEM Slate & Cyan', primaryColor: '#0f172a', accentColor: '#0284c7' },
  { id: 'burgundy-heritage', name: 'Heritage Burgundy', primaryColor: '#7f1d1d', accentColor: '#b45309' },
  { id: 'cobalt-modern', name: 'Cobalt Executive', primaryColor: '#1d4ed8', accentColor: '#3b82f6' },
  { id: 'teal-diplomat', name: 'Diplomat Teal & Bronze', primaryColor: '#115e59', accentColor: '#ca8a04' },
  { id: 'charcoal-swiss', name: 'Swiss Monochrome', primaryColor: '#18181b', accentColor: '#52525b' },
  { id: 'indigo-innovate', name: 'Indigo Innovation', primaryColor: '#312e81', accentColor: '#6366f1' },
];

export const TUTOR_REMARK_PRESETS: TutorRemarkPreset[] = [
  {
    id: 'distinction-1',
    category: 'Distinction',
    label: 'Outstanding Mastery (Distinction)',
    text: 'Outstanding performance! Demonstrated exceptional mastery of core concepts, analytical reasoning, and accuracy throughout this assessment.',
  },
  {
    id: 'distinction-2',
    category: 'Distinction',
    label: 'Exemplary Problem Solving',
    text: 'Excellent result! Keep up this high standard of technical understanding, attention to detail, and problem-solving confidence.',
  },
  {
    id: 'commendable-1',
    category: 'Commendable',
    label: 'Strong & Commendable Effort',
    text: 'Very good performance. Shows a strong grasp of the curriculum with minor areas to refine in order to achieve full distinction.',
  },
  {
    id: 'commendable-2',
    category: 'Commendable',
    label: 'Consistent Progress',
    text: 'Commendable effort and solid progress. Reviewing the missed questions will help consolidate mastery ahead of the next evaluation.',
  },
  {
    id: 'satisfactory-1',
    category: 'Satisfactory',
    label: 'Satisfactory Pass — More Practice',
    text: 'Good effort and a satisfactory pass. Additional hands-on practice on the highlighted topics will strengthen future performance.',
  },
  {
    id: 'satisfactory-2',
    category: 'Satisfactory',
    label: 'Fair Understanding — Revise Key Topics',
    text: 'Fair performance. Please revise the areas where marks were lost and participate actively during upcoming revision sessions.',
  },
  {
    id: 'support-1',
    category: 'Support Needed',
    label: 'Needs Focused Revision & Support',
    text: 'Needs improvement. Please review the class notes and practice exercises carefully, and ask questions during remedial sessions.',
  },
  {
    id: 'support-2',
    category: 'Support Needed',
    label: 'Foundational Reinforcement Required',
    text: 'More consistent study and guided practice are required. We will focus on reinforcing foundational concepts in upcoming lessons.',
  },
  {
    id: 'general-1',
    category: 'General',
    label: 'Well Done on Completing Assessment',
    text: 'Well done on completing this assessment. Please review the question breakdown and expected answers for continuous improvement.',
  },
  {
    id: 'general-2',
    category: 'General',
    label: 'Verified by Subject Tutor',
    text: 'Assessment reviewed and verified by the subject tutor. Keep practicing regularly to build greater speed and accuracy.',
  },
];

export function getSuggestedTutorRemark(percentage?: number | null): string {
  if (typeof percentage !== 'number' || Number.isNaN(percentage)) {
    return TUTOR_REMARK_PRESETS[8].text;
  }
  if (percentage >= 80) return TUTOR_REMARK_PRESETS[0].text;
  if (percentage >= 65) return TUTOR_REMARK_PRESETS[2].text;
  if (percentage >= 50) return TUTOR_REMARK_PRESETS[4].text;
  return TUTOR_REMARK_PRESETS[6].text;
}

export const DOCUMENT_HEADER_TEMPLATES: DocumentHeaderTemplateMeta[] = [
  {
    id: 'classic-crest',
    number: 1,
    name: 'Classic Dual-Crest Banner',
    subtitle: 'Ceremonial full-width banner with dual crests & gold-accented ribbon',
    description: 'Rich institutional banner featuring left & right crests, centered display typography, and an elevated report classification bar.',
    recommendedPrimaryColor: '#14284b',
    recommendedAccentColor: '#b91c1c',
    recommendedFont: 'helvetica',
    layoutBadge: 'Dual Crest • Royal Banner',
  },
  {
    id: 'modern-executive',
    number: 2,
    name: 'Modern Executive Split',
    subtitle: 'Architectural left-aligned identity with right session ledger card',
    description: 'Sharp vertical accent pillar, crisp school identity on the left, and a structured session/date & reference card on the right.',
    recommendedPrimaryColor: '#0f172a',
    recommendedAccentColor: '#2563eb',
    recommendedFont: 'helvetica',
    layoutBadge: 'Executive Split • Ledger',
  },
  {
    id: 'royal-centered',
    number: 3,
    name: 'Royal Centered Emblem',
    subtitle: 'Elevated top crest with classical serif typography & ceremonial pill',
    description: 'Centered institutional crest crowned by a dual-tone top rule, italic motto, and a floating pill ribbon for the report title.',
    recommendedPrimaryColor: '#1e3a8a',
    recommendedAccentColor: '#d97706',
    recommendedFont: 'times',
    layoutBadge: 'Centered Crest • Ceremonial',
  },
  {
    id: 'minimalist-swiss',
    number: 4,
    name: 'Minimalist Swiss Editorial',
    subtitle: 'High-contrast architectural grid with precision typographic hierarchy',
    description: 'Clean white editorial surface with bold geometric rules, structured metadata columns, and ultra-sharp print legibility.',
    recommendedPrimaryColor: '#18181b',
    recommendedAccentColor: '#2563eb',
    recommendedFont: 'helvetica',
    layoutBadge: 'Swiss Grid • Ink-Saving',
  },
  {
    id: 'academic-seal',
    number: 5,
    name: 'University Double-Rule Seal',
    subtitle: 'Traditional academic transcript header with double rules & serif styling',
    description: 'Inspired by university senate transcripts with formal double horizontal rules, classical serif lettering, and a ledger bar.',
    recommendedPrimaryColor: '#7f1d1d',
    recommendedAccentColor: '#b45309',
    recommendedFont: 'times',
    layoutBadge: 'Senate Serif • Double Rule',
  },
  {
    id: 'tech-institute',
    number: 6,
    name: 'STEM & Robotics Academy',
    subtitle: 'Modern dark-slate technical header with cyan accent trim & mono badges',
    description: 'Purpose-built for coding, robotics, and digital literacy reports with a deep slate header, bright cyan rule, and bracketed tags.',
    recommendedPrimaryColor: '#0f172a',
    recommendedAccentColor: '#0284c7',
    recommendedFont: 'courier',
    layoutBadge: 'STEM • Technical Header',
  },
  {
    id: 'split-card-banner',
    number: 7,
    name: 'Framed Card & Metadata Strip',
    subtitle: 'Bordered institutional card with tinted contact & session footer bar',
    description: 'Encapsulates the school crest and title inside a framed card with a soft-tinted bottom strip for contact and session details.',
    recommendedPrimaryColor: '#065f46',
    recommendedAccentColor: '#10b981',
    recommendedFont: 'helvetica',
    layoutBadge: 'Framed Card • Tinted Strip',
  },
  {
    id: 'compact-official',
    number: 8,
    name: 'Compact Audit Transcript',
    subtitle: 'Sleek high-density horizontal header maximizing first-page table space',
    description: 'Streamlined two-column horizontal band ideal for multi-question transcripts where maximum first-page space is essential.',
    recommendedPrimaryColor: '#312e81',
    recommendedAccentColor: '#6366f1',
    recommendedFont: 'helvetica',
    layoutBadge: 'Compact • High Density',
  },
  {
    id: 'prestige-gold',
    number: 9,
    name: 'Prestige Double-Framed Pillar',
    subtitle: 'Regal deep-toned header with warm gold inner border & corner framing',
    description: 'Distinguished double-framed plaque with a rich primary fill, warm gold inner border, and ceremonial typography.',
    recommendedPrimaryColor: '#3b0764',
    recommendedAccentColor: '#f59e0b',
    recommendedFont: 'times',
    layoutBadge: 'Prestige Frame • Gold Trim',
  },
  {
    id: 'global-standard',
    number: 10,
    name: 'International Examination Board',
    subtitle: 'Partitioned examination board grid with official classification box',
    description: 'Structured multi-cell layout inspired by international examination boards with dedicated institution and record classification cells.',
    recommendedPrimaryColor: '#115e59',
    recommendedAccentColor: '#ca8a04',
    recommendedFont: 'helvetica',
    layoutBadge: 'Board Grid • Partitioned',
  },
];

const LOCAL_STORAGE_PREFIX = 'jdi_doc_header_config_v1:';

export function getCurrentAcademicSessionLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 8) {
    return `${year}/${year + 1} Academic Session`;
  }
  return `${year - 1}/${year} Academic Session`;
}

export function getDefaultDocumentHeaderConfig(
  overrides: Partial<DocumentHeaderConfig> = {}
): DocumentHeaderConfig {
  const todayStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const tplId = overrides.templateId || 'classic-crest';
  const tplMeta =
    DOCUMENT_HEADER_TEMPLATES.find((t) => t.id === tplId) || DOCUMENT_HEADER_TEMPLATES[0];

  return {
    templateId: tplId,
    institutionName: overrides.institutionName ?? 'Jaystarbliss Dynamic Innovations',
    departmentOrFaculty:
      overrides.departmentOrFaculty ?? 'Department of STEM, Coding, Robotics & Digital Literacy',
    tagline:
      overrides.tagline ??
      'Authorized Academic Partner • Excellence in Technology & Innovation Education',
    address: overrides.address ?? '',
    email: overrides.email ?? 'info@jaystarbliss.com',
    phone: overrides.phone ?? '',
    website: overrides.website ?? 'www.jaystarbliss.com',
    academicSession: overrides.academicSession ?? getCurrentAcademicSessionLabel(),
    assessmentDate: overrides.assessmentDate ?? todayStr,
    reportTitle: overrides.reportTitle ?? '',
    reportSubtitle:
      overrides.reportSubtitle ?? 'Verified Candidate Assessment & Transcript Record',
    referenceCode: overrides.referenceCode ?? 'JDI-OFFICIAL-TRANSCRIPT',
    accreditationNote:
      overrides.accreditationNote ?? 'Authenticated Academic Record',
    logoDataUrl: overrides.logoDataUrl ?? '',
    secondaryLogoDataUrl: overrides.secondaryLogoDataUrl ?? '',
    showSecondaryLogo: overrides.showSecondaryLogo ?? true,
    logoPosition: overrides.logoPosition || 'dual',
    logoSize: overrides.logoSize || 'medium',
    logoFrame: overrides.logoFrame || 'rounded',
    primaryColor: overrides.primaryColor || tplMeta.recommendedPrimaryColor || '#14284b',
    accentColor: overrides.accentColor || tplMeta.recommendedAccentColor || '#b91c1c',
    headerTextColor: overrides.headerTextColor ?? '',
    headerBgStyle: overrides.headerBgStyle || 'template-default',
    fontFamily: overrides.fontFamily || tplMeta.recommendedFont || 'helvetica',
    titleScale: overrides.titleScale || 'standard',
    headerAlignment: overrides.headerAlignment || 'auto',
    showMotto: overrides.showMotto ?? true,
    showDepartment: overrides.showDepartment ?? true,
    showContactRow: overrides.showContactRow ?? true,
    showAcademicSession: overrides.showAcademicSession ?? true,
    showReferenceCode: overrides.showReferenceCode ?? true,
    updatedAt: overrides.updatedAt,
    updatedBy: overrides.updatedBy,
  };
}

export function resolveSchoolPrefillForHeader(
  schoolDoc?: Record<string, any> | null,
  fallbackSchoolName?: string
): Partial<DocumentHeaderConfig> {
  if (!schoolDoc && !fallbackSchoolName) {
    return {};
  }

  const savedHeader =
    schoolDoc?.reportHeaderConfig && typeof schoolDoc.reportHeaderConfig === 'object'
      ? schoolDoc.reportHeaderConfig
      : {};

  const institutionName =
    savedHeader.institutionName ||
    schoolDoc?.name ||
    schoolDoc?.schoolName ||
    schoolDoc?.institutionName ||
    fallbackSchoolName ||
    '';

  const address =
    savedHeader.address ||
    schoolDoc?.address ||
    schoolDoc?.schoolAddress ||
    schoolDoc?.location ||
    schoolDoc?.city ||
    '';

  const email =
    savedHeader.email ||
    schoolDoc?.email ||
    schoolDoc?.schoolEmail ||
    schoolDoc?.contactEmail ||
    schoolDoc?.adminEmail ||
    '';

  const phone =
    savedHeader.phone ||
    schoolDoc?.phone ||
    schoolDoc?.phoneNumber ||
    schoolDoc?.contactPhone ||
    schoolDoc?.telephone ||
    '';

  const website =
    savedHeader.website ||
    schoolDoc?.website ||
    schoolDoc?.schoolWebsite ||
    '';

  const tagline =
    savedHeader.tagline ||
    schoolDoc?.motto ||
    schoolDoc?.tagline ||
    schoolDoc?.slogan ||
    'Authorized Academic Partner • Excellence in Digital & STEM Education';

  const logoDataUrl =
    savedHeader.logoDataUrl ||
    schoolDoc?.logoUrl ||
    schoolDoc?.logo ||
    schoolDoc?.crestUrl ||
    '';

  return {
    ...savedHeader,
    ...(institutionName ? { institutionName } : {}),
    ...(address ? { address } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(website ? { website } : {}),
    ...(tagline ? { tagline } : {}),
    ...(logoDataUrl ? { logoDataUrl } : {}),
  };
}

export function getCachedDocumentHeaderConfig(scopeKey = 'default'): DocumentHeaderConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${scopeKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return getDefaultDocumentHeaderConfig(parsed);
  } catch {
    return null;
  }
}

export function setCachedDocumentHeaderConfig(
  scopeKey: string,
  config: DocumentHeaderConfig
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${scopeKey}`, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

export async function loadSavedDocumentHeaderConfig(options: {
  scopeKey?: string;
  schoolId?: string;
  fallbackSchoolName?: string;
}): Promise<DocumentHeaderConfig> {
  const scopeKey = (options.scopeKey || options.schoolId || 'default').trim() || 'default';
  const schoolId = (options.schoolId || '').trim();

  const cached = getCachedDocumentHeaderConfig(scopeKey);
  let schoolPrefill: Partial<DocumentHeaderConfig> = {};
  let remoteConfig: Partial<DocumentHeaderConfig> = {};

  if (schoolId && schoolId !== 'private' && schoolId !== 'all') {
    try {
      const schoolSnap = await getDoc(doc(db, 'schools', schoolId));
      if (schoolSnap.exists()) {
        const schoolData = schoolSnap.data();
        schoolPrefill = resolveSchoolPrefillForHeader(schoolData, options.fallbackSchoolName);
      }
    } catch {
      // Non-fatal if offline or restricted
    }
  }

  try {
    const configSnap = await getDoc(doc(db, 'documentHeaderConfigs', scopeKey));
    if (configSnap.exists()) {
      remoteConfig = configSnap.data() as Partial<DocumentHeaderConfig>;
    }
  } catch {
    // Fallback to cached or school prefill
  }

  const merged = getDefaultDocumentHeaderConfig({
    ...(options.fallbackSchoolName ? { institutionName: options.fallbackSchoolName } : {}),
    ...schoolPrefill,
    ...(cached || {}),
    ...remoteConfig,
  });

  if (
    options.fallbackSchoolName &&
    (!merged.institutionName || merged.institutionName === 'Jaystarbliss Dynamic Innovations')
  ) {
    merged.institutionName = options.fallbackSchoolName;
  }

  setCachedDocumentHeaderConfig(scopeKey, merged);
  return merged;
}

export async function saveDocumentHeaderConfig(
  config: DocumentHeaderConfig,
  options: {
    scopeKey?: string;
    schoolId?: string;
    updateSchoolProfile?: boolean;
    updatedBy?: string;
  } = {}
): Promise<DocumentHeaderConfig> {
  const scopeKey = (options.scopeKey || options.schoolId || 'default').trim() || 'default';
  const nowIso = new Date().toISOString();
  const normalized: DocumentHeaderConfig = {
    ...getDefaultDocumentHeaderConfig(config),
    updatedAt: nowIso,
    updatedBy: options.updatedBy || config.updatedBy || '',
  };

  setCachedDocumentHeaderConfig(scopeKey, normalized);

  try {
    await setDoc(
      doc(db, 'documentHeaderConfigs', scopeKey),
      {
        ...normalized,
        schoolId: options.schoolId || '',
        scopeKey,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Saved document header config locally; remote sync skipped:', err);
  }

  if (
    options.updateSchoolProfile &&
    options.schoolId &&
    options.schoolId !== 'private' &&
    options.schoolId !== 'all'
  ) {
    await setDoc(
      doc(db, 'schools', options.schoolId),
      {
        reportHeaderConfig: normalized,
        updatedAt: nowIso,
      },
      { merge: true }
    );
  }

  return normalized;
}

export function hexToRgbTuple(
  hex: string,
  fallback: [number, number, number] = [20, 40, 75]
): [number, number, number] {
  const cleaned = String(hex || '')
    .trim()
    .replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return [r, g, b];
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b];
  }
  return fallback;
}
