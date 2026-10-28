import jsPDF from 'jspdf';
import {
  computeExamMaxScore,
  formatScoreSummary,
  resolvePartnerSchoolName,
  resolveAttemptQuestions,
  formatNormalizedClassDisplay,
  canViewOrPrintAttemptResult,
  getWorkTypeLabels,
} from './classes';
import {
  type DocumentHeaderConfig,
  PERMANENT_COMPANY_WATERMARK,
  getDefaultDocumentHeaderConfig,
  getCachedDocumentHeaderConfig,
  hexToRgbTuple,
} from './documentHeaderTemplates';

export interface ExamReportQuestionItem {
  id: string;
  prompt: string;
  type: string;
  points: number;
  options?: Array<{ id: string; text: string }>;
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
  explanation?: string;
}

export interface ExamReportQuestionResult {
  questionId: string;
  correct?: boolean;
  manualReview?: boolean;
  pointsAwarded: number;
  maxPoints: number;
}

export interface ExamReportData {
  attemptId?: string;
  examTitle: string;
  subject: string;
  workType?: string;
  schoolId?: string;
  schoolName?: string;
  className?: string;
  studentName: string;
  studentEmail?: string;
  studentCode?: string;
  score: number | null;
  maxScore: number;
  percentage: number | null;
  grade?: string;
  status?: string;
  startedAt?: string | null;
  submittedAt?: string | null;
  releasedAt?: string | null;
  resultReleased?: boolean;
  callerRole?: string;
  tutorFeedback?: string;
  questions?: ExamReportQuestionItem[];
  answers?: Record<string, any>;
  questionResults?: ExamReportQuestionResult[];
  includeAnswerKey?: boolean;
  headerConfig?: Partial<DocumentHeaderConfig>;
}

let cachedCompanyLogoDataUrl: string | null = null;
const customLogoCache = new Map<string, string>();

async function loadImageDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;
  if (customLogoCache.has(url)) return customLogoCache.get(url) || null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (dataUrl) {
      customLogoCache.set(url, dataUrl);
    }
    return dataUrl;
  } catch {
    return null;
  }
}

async function loadOfficialCompanyLogoDataUrl(): Promise<string | null> {
  if (cachedCompanyLogoDataUrl) return cachedCompanyLogoDataUrl;
  const urls = [
    PERMANENT_COMPANY_WATERMARK.primaryLogoUrl,
    PERMANENT_COMPANY_WATERMARK.fallbackLogoUrl,
    PERMANENT_COMPANY_WATERMARK.secondaryFallbackUrl,
  ];
  for (const url of urls) {
    const dataUrl = await loadImageDataUrl(url);
    if (dataUrl) {
      cachedCompanyLogoDataUrl = dataUrl;
      return dataUrl;
    }
  }
  return null;
}

function formatDateStr(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAnswerText(question: ExamReportQuestionItem, rawAnswer: any): string {
  if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') {
    return 'No response recorded';
  }
  const options = Array.isArray(question.options) ? question.options : [];
  if (Array.isArray(rawAnswer)) {
    if (rawAnswer.length === 0) return 'No response recorded';
    return rawAnswer
      .map((val) => {
        const match = options.find((o) => o.id === val);
        return match ? match.text : String(val);
      })
      .join(', ');
  }
  const match = options.find((o) => o.id === String(rawAnswer));
  return match ? match.text : String(rawAnswer);
}

function formatCorrectAnswerText(question: ExamReportQuestionItem): string {
  const options = Array.isArray(question.options) ? question.options : [];
  if (Array.isArray(question.correctOptionIds) && question.correctOptionIds.length > 0) {
    return question.correctOptionIds
      .map((id) => {
        const match = options.find((o) => o.id === id);
        return match ? match.text : id;
      })
      .join(', ');
  }
  if (Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length > 0) {
    return question.acceptedAnswers.join(' / ');
  }
  return 'Manual / Tutor Rubric Evaluation';
}

function buildContactLine(header: DocumentHeaderConfig): string {
  const parts: string[] = [];
  if (header.address?.trim()) parts.push(header.address.trim());
  if (header.email?.trim()) parts.push(header.email.trim());
  if (header.phone?.trim()) parts.push(header.phone.trim());
  if (header.website?.trim()) parts.push(header.website.trim());
  return parts.join('  •  ');
}

function buildSessionAndDateLine(header: DocumentHeaderConfig): string {
  const parts: string[] = [];
  if (header.showAcademicSession && header.academicSession?.trim()) {
    parts.push(header.academicSession.trim());
  }
  if (header.assessmentDate?.trim()) {
    parts.push(`Date: ${header.assessmentDate.trim()}`);
  }
  return parts.join('   |   ');
}

function safeAddLogo(
  doc: jsPDF,
  logoDataUrl: string | null,
  x: number,
  y: number,
  w: number,
  h: number
): boolean {
  if (!logoDataUrl) return false;
  try {
    const format = logoDataUrl.startsWith('data:image/jpeg') || logoDataUrl.startsWith('data:image/jpg')
      ? 'JPEG'
      : 'PNG';
    doc.addImage(logoDataUrl, format, x, y, w, h);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mandatory, centralized JayStar Bliss Studios company watermark renderer.
 * Renders the transparent JayStar Bliss logo (/assets/FINAL_LOGO_JDI-removebg-preview.png)
 * centered across every page of a generated PDF document without extra rings or boxes.
 */
export function drawPermanentCompanyWatermark(
  doc: jsPDF,
  companyLogoDataUrl: string | null
): void {
  if (!companyLogoDataUrl) return;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2 + 6;

  const anyDoc = doc as any;
  const canUseGState = typeof anyDoc.GState === 'function' && typeof anyDoc.setGState === 'function';

  if (typeof anyDoc.saveGraphicsState === 'function') {
    anyDoc.saveGraphicsState();
  }

  try {
    if (canUseGState) {
      anyDoc.setGState(new anyDoc.GState({ opacity: PERMANENT_COMPANY_WATERMARK.opacity }));
    }

    const logoSize = Math.min(pageWidth * PERMANENT_COMPANY_WATERMARK.scaleRatio, 118);
    safeAddLogo(
      doc,
      companyLogoDataUrl,
      centerX - logoSize / 2,
      centerY - logoSize / 2,
      logoSize,
      logoSize
    );
  } finally {
    if (canUseGState) {
      anyDoc.setGState(new anyDoc.GState({ opacity: 1 }));
    }
    if (typeof anyDoc.restoreGraphicsState === 'function') {
      anyDoc.restoreGraphicsState();
    }
  }
}

/**
 * Renders any of the 10 customizable institutional header templates on the PDF page
 * and returns the Y coordinate where the body content should begin.
 */
function drawCustomizableDocumentHeader(
  doc: jsPDF,
  header: DocumentHeaderConfig,
  primaryLogo: string | null,
  secondaryLogo: string | null,
  companyLogo: string | null
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const primaryRgb = hexToRgbTuple(header.primaryColor, [20, 40, 75]);
  const accentRgb = hexToRgbTuple(header.accentColor, [185, 28, 28]);
  const customTextRgb = header.headerTextColor?.trim()
    ? hexToRgbTuple(header.headerTextColor, [255, 255, 255])
    : null;
  const font = header.fontFamily || 'helvetica';
  const scaleBoost =
    header.titleScale === 'grand' ? 1.5 : header.titleScale === 'compact' ? -1.2 : 0;
  const logoDim =
    header.logoSize === 'large' ? 24 : header.logoSize === 'small' ? 15 : 20;

  const instName = (header.institutionName || 'Jaystarbliss Dynamic Innovations').toUpperCase();
  const deptLine =
    header.showDepartment !== false && header.departmentOrFaculty?.trim()
      ? header.departmentOrFaculty.trim()
      : '';
  const tagline =
    header.showMotto !== false && header.tagline?.trim()
      ? header.tagline.trim()
      : '';
  const subtitleLine = [deptLine, tagline].filter(Boolean).join('  •  ');
  const reportTitle = (header.reportTitle || 'Official Assessment Performance Report').toUpperCase();
  const refBadge =
    header.showReferenceCode !== false && header.referenceCode?.trim()
      ? header.referenceCode.trim()
      : '';
  const contactLine = header.showContactRow ? buildContactLine(header) : '';
  const sessionDateLine = [
    buildSessionAndDateLine(header),
    refBadge ? `Ref: ${refBadge}` : '',
  ]
    .filter(Boolean)
    .join('   |   ');

  const leftLogo = primaryLogo || companyLogo;
  const rightLogo =
    header.showSecondaryLogo === false
      ? null
      : secondaryLogo || companyLogo || primaryLogo;

  switch (header.templateId) {
    case 'modern-executive': {
      // Template 2: Left accent pillar, executive left identity block, right session ledger card
      const isSolid = header.headerBgStyle === 'solid';
      doc.setFillColor(...(isSolid ? primaryRgb : ([248, 250, 252] as [number, number, number])));
      doc.rect(0, 0, pageWidth, 44, 'F');
      doc.setFillColor(...primaryRgb);
      doc.rect(0, 0, 5.5, 44, 'F');
      doc.setFillColor(...accentRgb);
      doc.rect(5.5, 41.5, pageWidth - 5.5, 2.5, 'F');

      const hasLeft =
        header.logoPosition !== 'right' &&
        safeAddLogo(doc, leftLogo, 11, 6, logoDim, logoDim);
      const textStartX = hasLeft ? 14 + logoDim : 12;

      doc.setFont(font, 'bold');
      doc.setFontSize(13.5 + scaleBoost);
      doc.setTextColor(...(customTextRgb || (isSolid ? [255, 255, 255] : primaryRgb)));
      doc.text(instName, textStartX, 13, { maxWidth: pageWidth - textStartX - 70 });

      if (subtitleLine) {
        doc.setFont(font, 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(...(isSolid ? ([226, 232, 240] as [number, number, number]) : ([71, 85, 105] as [number, number, number])));
        doc.text(subtitleLine, textStartX, 18.8, { maxWidth: pageWidth - textStartX - 70 });
      }

      doc.setFont(font, 'bold');
      doc.setFontSize(9.2);
      doc.setTextColor(...(isSolid ? ([255, 255, 255] as [number, number, number]) : accentRgb));
      doc.text(reportTitle, textStartX, 26.5);

      if (contactLine) {
        doc.setFont(font, 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(...(isSolid ? ([203, 213, 225] as [number, number, number]) : ([100, 116, 139] as [number, number, number])));
        doc.text(contactLine, textStartX, 33.5, { maxWidth: pageWidth - textStartX - 14 });
      }

      // Right session/date ledger box
      doc.setFillColor(...primaryRgb);
      doc.roundedRect(pageWidth - 66, 6, 54, 21, 2, 2, 'F');
      doc.setFont(font, 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(255, 255, 255);
      doc.text(header.academicSession || 'Current Session', pageWidth - 39, 12.5, {
        align: 'center',
        maxWidth: 50,
      });
      doc.setFont(font, 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(226, 232, 240);
      doc.text(`Date: ${header.assessmentDate || '—'}`, pageWidth - 39, 18, {
        align: 'center',
        maxWidth: 50,
      });
      if (refBadge) {
        doc.text(refBadge, pageWidth - 39, 23, { align: 'center', maxWidth: 50 });
      }
      return 49;
    }

    case 'royal-centered': {
      // Template 3: Centered emblem on top, grand title, ceremonial pill ribbon
      doc.setFillColor(...primaryRgb);
      doc.rect(0, 0, pageWidth, 3.5, 'F');
      doc.setFillColor(...accentRgb);
      doc.rect(0, 3.5, pageWidth, 1.2, 'F');

      if (leftLogo) {
        safeAddLogo(doc, leftLogo, pageWidth / 2 - logoDim / 2, 6.5, logoDim, logoDim);
      }

      const baseTop = leftLogo ? 10 + logoDim : 14;
      doc.setFont(font, 'bold');
      doc.setFontSize(14 + scaleBoost);
      doc.setTextColor(...(customTextRgb || primaryRgb));
      doc.text(instName, pageWidth / 2, baseTop, { align: 'center', maxWidth: pageWidth - 28 });

      if (subtitleLine) {
        doc.setFont(font, 'italic');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(subtitleLine, pageWidth / 2, baseTop + 5, {
          align: 'center',
          maxWidth: pageWidth - 28,
        });
      }

      if (contactLine) {
        doc.setFont(font, 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(100, 116, 139);
        doc.text(contactLine, pageWidth / 2, baseTop + 9.5, {
          align: 'center',
          maxWidth: pageWidth - 24,
        });
      }

      const ribbonY = baseTop + (contactLine ? 12.5 : 8);
      doc.setFillColor(...accentRgb);
      doc.roundedRect(20, ribbonY, pageWidth - 40, 7.8, 2, 2, 'F');
      doc.setFont(font, 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(255, 255, 255);
      doc.text(
        sessionDateLine ? `${reportTitle}  •  ${sessionDateLine}` : reportTitle,
        pageWidth / 2,
        ribbonY + 5.2,
        { align: 'center', maxWidth: pageWidth - 46 }
      );
      return ribbonY + 13;
    }

    case 'minimalist-swiss': {
      // Template 4: Crisp architectural rules and editorial grid
      const logoPlaced =
        header.logoPosition !== 'right' &&
        safeAddLogo(doc, leftLogo, 14, 8, logoDim - 2, logoDim - 2);
      const startX = logoPlaced ? 18 + logoDim : 14;

      doc.setFont(font, 'bold');
      doc.setFontSize(13.5 + scaleBoost);
      doc.setTextColor(...(customTextRgb || primaryRgb));
      doc.text(instName, startX, 14, { maxWidth: pageWidth - startX - 14 });

      if (subtitleLine) {
        doc.setFont(font, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(subtitleLine, startX, 19.5, { maxWidth: pageWidth - startX - 14 });
      }

      if (contactLine) {
        doc.setFontSize(7.2);
        doc.setTextColor(100, 116, 139);
        doc.text(contactLine, startX, 24.5, { maxWidth: pageWidth - startX - 14 });
      }

      doc.setDrawColor(...primaryRgb);
      doc.setLineWidth(1.0);
      doc.line(14, 29, pageWidth - 14, 29);

      doc.setFont(font, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...accentRgb);
      doc.text(reportTitle, 14, 34.5);

      if (sessionDateLine) {
        doc.setFont(font, 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(sessionDateLine, pageWidth - 14, 34.5, { align: 'right' });
      }

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.35);
      doc.line(14, 37.2, pageWidth - 14, 37.2);
      return 42.5;
    }

    case 'academic-seal': {
      // Template 5: Traditional University Double-Rule & Serif Header
      safeAddLogo(doc, leftLogo, 14, 7.5, logoDim, logoDim);
      if (rightLogo) {
        safeAddLogo(doc, rightLogo, pageWidth - 14 - logoDim, 7.5, logoDim, logoDim);
      }

      doc.setFont('times', 'bold');
      doc.setFontSize(14.5 + scaleBoost);
      doc.setTextColor(...(customTextRgb || primaryRgb));
      doc.text(instName, pageWidth / 2, 13.5, { align: 'center', maxWidth: pageWidth - 76 });

      if (subtitleLine) {
        doc.setFont('times', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.text(subtitleLine, pageWidth / 2, 19, { align: 'center', maxWidth: pageWidth - 76 });
      }

      if (contactLine) {
        doc.setFont('times', 'normal');
        doc.setFontSize(7.4);
        doc.setTextColor(100, 116, 139);
        doc.text(contactLine, pageWidth / 2, 24.2, { align: 'center', maxWidth: pageWidth - 72 });
      }

      // Formal double rules
      doc.setDrawColor(...primaryRgb);
      doc.setLineWidth(0.85);
      doc.line(14, 30, pageWidth - 14, 30);
      doc.setLineWidth(0.25);
      doc.line(14, 31.4, pageWidth - 14, 31.4);

      doc.setFont('times', 'bold');
      doc.setFontSize(9.2);
      doc.setTextColor(...accentRgb);
      doc.text(reportTitle, 14, 36.4);

      if (sessionDateLine) {
        doc.setFont('times', 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(71, 85, 105);
        doc.text(sessionDateLine, pageWidth - 14, 36.4, { align: 'right' });
      }

      doc.line(14, 39, pageWidth - 14, 39);
      return 44;
    }

    case 'tech-institute': {
      // Template 6: Dark slate STEM header band with cyan/accent bottom rule
      doc.setFillColor(...primaryRgb);
      doc.rect(0, 0, pageWidth, 39, 'F');
      doc.setFillColor(...accentRgb);
      doc.rect(0, 39, pageWidth, 2.8, 'F');

      const hasLogo = safeAddLogo(doc, leftLogo, 12, 6, logoDim, logoDim);
      const xOffset = hasLogo ? 16 + logoDim : 14;

      doc.setFont(font, 'bold');
      doc.setFontSize(13 + scaleBoost);
      doc.setTextColor(...(customTextRgb || ([255, 255, 255] as [number, number, number])));
      doc.text(instName, xOffset, 13, { maxWidth: pageWidth - xOffset - 14 });

      if (subtitleLine) {
        doc.setFont(font, 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(186, 230, 253);
        doc.text(subtitleLine, xOffset, 18.5, { maxWidth: pageWidth - xOffset - 14 });
      }

      if (contactLine) {
        doc.setFontSize(7);
        doc.setTextColor(203, 213, 225);
        doc.text(contactLine, xOffset, 23.8, { maxWidth: pageWidth - xOffset - 14 });
      }

      doc.setFont(font, 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(255, 255, 255);
      doc.text(`[ ${reportTitle} ]`, xOffset, 32.5);

      if (sessionDateLine) {
        doc.setFontSize(7.2);
        doc.setTextColor(224, 242, 254);
        doc.text(sessionDateLine, pageWidth - 14, 32.5, { align: 'right' });
      }
      return 46.5;
    }

    case 'split-card-banner': {
      // Template 7: Framed Card Container with tinted metadata strip
      doc.setDrawColor(...primaryRgb);
      doc.setLineWidth(0.6);
      doc.roundedRect(12, 6, pageWidth - 24, 36, 2.5, 2.5, 'S');

      doc.setFillColor(...primaryRgb);
      doc.rect(12, 31.5, pageWidth - 24, 10.5, 'F');

      const hasLogo = safeAddLogo(doc, leftLogo, 16, 8.5, logoDim - 1, logoDim - 1);
      const startX = hasLogo ? 19 + logoDim : 17;

      doc.setFont(font, 'bold');
      doc.setFontSize(13 + scaleBoost);
      doc.setTextColor(...(customTextRgb || primaryRgb));
      doc.text(instName, startX, 14.5, { maxWidth: pageWidth - startX - 18 });

      if (subtitleLine) {
        doc.setFont(font, 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(71, 85, 105);
        doc.text(subtitleLine, startX, 20, { maxWidth: pageWidth - startX - 18 });
      }

      doc.setFont(font, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...accentRgb);
      doc.text(reportTitle, startX, 27);

      doc.setFont(font, 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(255, 255, 255);
      const stripText = [contactLine, sessionDateLine].filter(Boolean).join('   |   ');
      doc.text(stripText || reportTitle, pageWidth / 2, 38, {
        align: 'center',
        maxWidth: pageWidth - 32,
      });

      return 47;
    }

    case 'compact-official': {
      // Template 8: Space-efficient high-density header
      doc.setFillColor(...primaryRgb);
      doc.rect(0, 0, pageWidth, 27, 'F');
      doc.setFillColor(...accentRgb);
      doc.rect(0, 27, pageWidth, 1.5, 'F');

      const hasLogo = safeAddLogo(doc, leftLogo, 12, 4.5, 17, 17);
      const startX = hasLogo ? 32 : 14;

      doc.setFont(font, 'bold');
      doc.setFontSize(11.5 + scaleBoost);
      doc.setTextColor(...(customTextRgb || ([255, 255, 255] as [number, number, number])));
      doc.text(instName, startX, 10.5, { maxWidth: pageWidth - startX - 65 });

      doc.setFont(font, 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(226, 232, 240);
      doc.text(contactLine || subtitleLine, startX, 15.8, { maxWidth: pageWidth - startX - 65 });

      doc.setFont(font, 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(reportTitle, startX, 22);

      if (sessionDateLine) {
        doc.setFont(font, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(241, 245, 249);
        doc.text(sessionDateLine, pageWidth - 12, 22, { align: 'right' });
      }
      return 33;
    }

    case 'prestige-gold': {
      // Template 9: Deep fill with warm gold/accent border and centered typography
      doc.setFillColor(...primaryRgb);
      doc.rect(0, 0, pageWidth, 43, 'F');

      doc.setDrawColor(...accentRgb);
      doc.setLineWidth(0.75);
      doc.rect(8, 4, pageWidth - 16, 35, 'S');
      doc.setLineWidth(0.25);
      doc.rect(9.6, 5.6, pageWidth - 19.2, 31.8, 'S');

      safeAddLogo(doc, leftLogo, 13, 9, logoDim, logoDim);
      if (rightLogo) {
        safeAddLogo(doc, rightLogo, pageWidth - 13 - logoDim, 9, logoDim, logoDim);
      }

      doc.setFont(font, 'bold');
      doc.setFontSize(13.5 + scaleBoost);
      doc.setTextColor(...(customTextRgb || ([255, 255, 255] as [number, number, number])));
      doc.text(instName, pageWidth / 2, 14, { align: 'center', maxWidth: pageWidth - 76 });

      if (subtitleLine) {
        doc.setFont(font, 'italic');
        doc.setFontSize(8);
        doc.setTextColor(253, 230, 138);
        doc.text(subtitleLine, pageWidth / 2, 19.5, { align: 'center', maxWidth: pageWidth - 76 });
      }

      if (contactLine) {
        doc.setFont(font, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(226, 232, 240);
        doc.text(contactLine, pageWidth / 2, 24.5, { align: 'center', maxWidth: pageWidth - 76 });
      }

      doc.setFont(font, 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(255, 255, 255);
      doc.text(
        sessionDateLine ? `${reportTitle}  •  ${sessionDateLine}` : reportTitle,
        pageWidth / 2,
        32.5,
        { align: 'center', maxWidth: pageWidth - 76 }
      );
      return 48;
    }

    case 'global-standard': {
      // Template 10: International Examination Board partitioned grid header
      doc.setDrawColor(...primaryRgb);
      doc.setLineWidth(0.6);
      doc.rect(12, 6, pageWidth - 24, 35, 'S');

      const splitX = pageWidth - 68;
      doc.line(splitX, 6, splitX, 41);
      doc.line(12, 30, splitX, 30);

      const hasLogo = safeAddLogo(doc, leftLogo, 15, 8.5, 18, 18);
      const startX = hasLogo ? 36 : 16;

      doc.setFont(font, 'bold');
      doc.setFontSize(12 + scaleBoost);
      doc.setTextColor(...(customTextRgb || primaryRgb));
      doc.text(instName, startX, 14.5, { maxWidth: splitX - startX - 4 });

      if (subtitleLine) {
        doc.setFont(font, 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(subtitleLine, startX, 20, { maxWidth: splitX - startX - 4 });
      }

      if (contactLine) {
        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        doc.text(contactLine, startX, 25.5, { maxWidth: splitX - startX - 4 });
      }

      doc.setFont(font, 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...accentRgb);
      doc.text(reportTitle, 16, 36.8);

      // Right box: Session & Date
      doc.setFillColor(...primaryRgb);
      doc.rect(splitX, 6, pageWidth - 12 - splitX, 8, 'F');
      doc.setFont(font, 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(255, 255, 255);
      doc.text(
        header.accreditationNote?.toUpperCase() || 'ASSESSMENT RECORD',
        (splitX + pageWidth - 12) / 2,
        11.2,
        { align: 'center', maxWidth: 52 }
      );

      doc.setFont(font, 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(15, 23, 42);
      doc.text(header.academicSession || 'Current Session', (splitX + pageWidth - 12) / 2, 20, {
        align: 'center',
        maxWidth: 52,
      });

      doc.setFont(font, 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Date: ${header.assessmentDate || '—'}`, (splitX + pageWidth - 12) / 2, 27, {
        align: 'center',
        maxWidth: 52,
      });
      if (refBadge) {
        doc.text(refBadge, (splitX + pageWidth - 12) / 2, 36.8, {
          align: 'center',
          maxWidth: 52,
        });
      }
      return 46;
    }

    case 'classic-crest':
    default: {
      // Template 1: Classic Dual-Crest Full-Width Institutional Banner
      doc.setFillColor(...primaryRgb);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setFillColor(...accentRgb);
      doc.rect(0, 40, pageWidth, 2.2, 'F');

      safeAddLogo(doc, leftLogo, 12, 7, logoDim, logoDim);
      if (rightLogo) {
        safeAddLogo(doc, rightLogo, pageWidth - 12 - logoDim, 7, logoDim, logoDim);
      }

      doc.setFont(font, 'bold');
      doc.setFontSize(13.8 + scaleBoost);
      doc.setTextColor(...(customTextRgb || ([255, 255, 255] as [number, number, number])));
      doc.text(instName, pageWidth / 2, 13.5, { align: 'center', maxWidth: pageWidth - 76 });

      if (subtitleLine) {
        doc.setFont(font, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(219, 234, 254);
        doc.text(subtitleLine, pageWidth / 2, 19.2, { align: 'center', maxWidth: pageWidth - 76 });
      }

      if (contactLine) {
        doc.setFontSize(7);
        doc.setTextColor(226, 232, 240);
        doc.text(contactLine, pageWidth / 2, 24.5, { align: 'center', maxWidth: pageWidth - 76 });
      }

      doc.setFont(font, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(
        sessionDateLine ? `${reportTitle}  •  ${sessionDateLine}` : reportTitle,
        pageWidth / 2,
        33.5,
        { align: 'center', maxWidth: pageWidth - 76 }
      );
      return 47;
    }
  }
}

export async function createExamReportPdfDocument(data: ExamReportData): Promise<jsPDF> {
  // Enforce tutor release check for student, parent, and school-admin callers
  if (
    data.callerRole &&
    !canViewOrPrintAttemptResult(
      {
        status: data.status || 'submitted',
        releasedAt: data.releasedAt,
        resultReleased: data.resultReleased,
      },
      data.callerRole
    )
  ) {
    throw new Error('This result has not yet been released by the tutor.');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const companyLogoDataUrl = await loadOfficialCompanyLogoDataUrl();

  const resolvedSchool =
    resolvePartnerSchoolName(data.schoolName, data.schoolId) ||
    data.schoolName ||
    'Jaystarbliss Dynamic Innovations';
  const resolvedClass = formatNormalizedClassDisplay(data.className, 'General');
  const maxScore = computeExamMaxScore(
    { maxScore: data.maxScore, questions: data.questions },
    { maxScore: data.maxScore }
  );
  const summary = formatScoreSummary(data.score, maxScore);
  const typeLabels = getWorkTypeLabels(data.workType, data);

  // Resolve customizable header config (caller override -> cached school/default config -> defaults)
  const cachedHeader =
    getCachedDocumentHeaderConfig(data.schoolId || 'default') ||
    getCachedDocumentHeaderConfig('default');

  const effectiveHeader = getDefaultDocumentHeaderConfig({
    ...(cachedHeader || {}),
    ...(data.headerConfig || {}),
    institutionName:
      data.headerConfig?.institutionName ||
      cachedHeader?.institutionName ||
      resolvedSchool,
    reportTitle:
      data.headerConfig?.reportTitle ||
      cachedHeader?.reportTitle ||
      typeLabels.reportTitle,
    assessmentDate:
      data.headerConfig?.assessmentDate ||
      (data.submittedAt
        ? new Date(data.submittedAt).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : cachedHeader?.assessmentDate),
  });

  const customPrimaryLogo = effectiveHeader.logoDataUrl
    ? await loadImageDataUrl(effectiveHeader.logoDataUrl)
    : null;
  const customSecondaryLogo = effectiveHeader.secondaryLogoDataUrl
    ? await loadImageDataUrl(effectiveHeader.secondaryLogoDataUrl)
    : null;

  let cursorY = drawCustomizableDocumentHeader(
    doc,
    effectiveHeader,
    customPrimaryLogo,
    customSecondaryLogo,
    companyLogoDataUrl
  );

  const font = effectiveHeader.fontFamily || 'helvetica';
  const primaryRgb = hexToRgbTuple(effectiveHeader.primaryColor, [29, 78, 216]);

  // Student & Assessment Summary Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, cursorY, pageWidth - 28, 38, 3, 3, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont(font, 'bold');
  doc.setFontSize(9.5);
  doc.text('LEARNER & ASSESSMENT DETAILS', 18, cursorY + 7);

  doc.setFont(font, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Student Name: ${data.studentName || 'Student'}`, 18, cursorY + 14);
  doc.text(`Class / Level: ${resolvedClass}`, 18, cursorY + 20);
  doc.text(`School: ${resolvedSchool}`, 18, cursorY + 26);
  doc.text(
    `${typeLabels.singular}: ${data.examTitle || typeLabels.singular} (${data.subject || 'General'})`,
    18,
    cursorY + 32
  );

  // Score Box on Right
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(pageWidth - 76, cursorY + 4, 58, 30, 2, 2, 'FD');

  doc.setFont(font, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...primaryRgb);
  doc.text('FINAL SCORE', pageWidth - 47, cursorY + 10, { align: 'center' });

  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(
    summary.score !== null ? `${summary.fractionLabel} (${summary.percentageLabel})` : 'Pending Review',
    pageWidth - 47,
    cursorY + 19,
    { align: 'center' }
  );

  doc.setFontSize(8.5);
  doc.setTextColor(30, 64, 175);
  doc.text(
    `Grade: ${data.grade || summary.grade}  •  ${(data.status || 'SUBMITTED').toUpperCase()}`,
    pageWidth - 47,
    cursorY + 26,
    { align: 'center' }
  );

  doc.setFont(font, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Submitted: ${formatDateStr(data.submittedAt)}`, pageWidth - 47, cursorY + 31.5, {
    align: 'center',
  });

  cursorY += 44;

  // Tutor Feedback if present
  if (data.tutorFeedback && data.tutorFeedback.trim()) {
    doc.setFillColor(254, 252, 232);
    doc.setDrawColor(253, 224, 71);
    const feedbackLines = doc.splitTextToSize(data.tutorFeedback.trim(), pageWidth - 36);
    const boxHeight = Math.max(16, feedbackLines.length * 4.5 + 10);
    doc.roundedRect(14, cursorY, pageWidth - 28, boxHeight, 2, 2, 'FD');

    doc.setFont(font, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(133, 77, 14);
    doc.text('TUTOR REMARK & FEEDBACK:', 18, cursorY + 6);

    doc.setFont(font, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(113, 63, 18);
    doc.text(feedbackLines, 18, cursorY + 11.5);
    cursorY += boxHeight + 6;
  }

  // Question Breakdown Table
  const questions = resolveAttemptQuestions({ questions: data.questions }, data);
  const resultsMap = new Map<string, ExamReportQuestionResult>();
  (data.questionResults || []).forEach((r) => {
    if (r && r.questionId) resultsMap.set(r.questionId, r);
  });

  if (questions.length > 0) {
    const includeKey = data.includeAnswerKey !== false;
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const tableWidth = pageWidth - marginX * 2;
    const colWidths = includeKey
      ? [9, 54, 42, 42, 18, 17]
      : [10, 74, 58, 20, 20];
    const headers = includeKey
      ? ['#', 'Question Prompt', 'Learner Response', 'Expected Answer', 'Marks', 'Status']
      : ['#', 'Question Prompt', 'Learner Response', 'Marks', 'Status'];

    const drawTableHeader = (y: number): number => {
      doc.setFillColor(...primaryRgb);
      doc.rect(marginX, y, tableWidth, 7.5, 'F');
      doc.setFont(font, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      let x = marginX;
      headers.forEach((h, i) => {
        doc.text(h, x + 2, y + 5);
        x += colWidths[i];
      });
      return y + 7.5;
    };

    if (cursorY + 20 > pageHeight - 20) {
      doc.addPage();
      cursorY = 18;
    }
    cursorY = drawTableHeader(cursorY);

    questions.forEach((q: ExamReportQuestionItem, idx: number) => {
      const res = resultsMap.get(q.id);
      const rawAns = data.answers ? data.answers[q.id] : undefined;
      const ansText = formatAnswerText(q, rawAns);
      const expectedText = formatCorrectAnswerText(q);
      const maxPts = Number(res?.maxPoints ?? q.points ?? 1);
      const awardedPts = res?.pointsAwarded !== undefined ? Number(res.pointsAwarded) : 0;
      const statusLabel = res?.manualReview
        ? 'Review'
        : res?.correct
        ? 'Correct'
        : 'Incorrect';

      const cells = includeKey
        ? [
            String(idx + 1),
            String(q.prompt || `Question ${idx + 1}`),
            ansText,
            expectedText,
            `${awardedPts} / ${maxPts}`,
            statusLabel,
          ]
        : [
            String(idx + 1),
            String(q.prompt || `Question ${idx + 1}`),
            ansText,
            `${awardedPts} / ${maxPts}`,
            statusLabel,
          ];

      doc.setFont(font, 'normal');
      doc.setFontSize(7.5);
      const wrappedCells = cells.map((cellText, colIdx) =>
        doc.splitTextToSize(String(cellText || '—'), Math.max(8, colWidths[colIdx] - 4))
      );
      const maxLines = Math.max(1, ...wrappedCells.map((lines: string[]) => lines.length));
      const rowHeight = Math.max(6.5, maxLines * 3.6 + 3);

      if (cursorY + rowHeight > pageHeight - 18) {
        doc.addPage();
        cursorY = 18;
        cursorY = drawTableHeader(cursorY);
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, cursorY, tableWidth, rowHeight, 'F');
      }

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(marginX, cursorY, tableWidth, rowHeight, 'S');

      let colX = marginX;
      wrappedCells.forEach((lines: string[], colIdx: number) => {
        if (colIdx > 0) {
          doc.line(colX, cursorY, colX, cursorY + rowHeight);
        }
        doc.setFont(font, colIdx === 0 || colIdx === cells.length - 1 ? 'bold' : 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text(lines, colX + 2, cursorY + 4.2);
        colX += colWidths[colIdx];
      });

      cursorY += rowHeight;
    });
  } else {
    doc.setFont(font, 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Summary score report (${typeLabels.lowerSingular} question breakdown not attached to this view).`,
      14,
      cursorY + 8
    );
  }

  // Apply permanent centered J-Established Studio watermark AND page footers across ALL pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    drawPermanentCompanyWatermark(doc, companyLogoDataUrl);

    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);
    doc.setFont(font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${effectiveHeader.institutionName} • Authenticated by ${PERMANENT_COMPANY_WATERMARK.companyName} • Generated ${new Date().toLocaleDateString('en-GB')}`,
      14,
      pageHeight - 9
    );
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 9, { align: 'right' });
  }

  return doc;
}

export async function downloadSingleExamReportPdf(
  data: ExamReportData,
  filename?: string
): Promise<void> {
  const doc = await createExamReportPdfDocument(data);
  const safeStudent = (data.studentName || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeExam = (data.examTitle || 'Assessment').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(filename || `${safeStudent}_${safeExam}_Report.pdf`);
}

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipArchiveBlob(files: Array<{ name: string; data: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = computeCrc32(file.data);
    const size = file.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = centralParts.reduce((acc, part) => acc + part.length, 0);
  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endRecord] as BlobPart[], {
    type: 'application/zip',
  });
}

export async function downloadBulkExamReportsZip(
  reports: ExamReportData[],
  zipFilename = 'JDI_Assessment_Reports.zip'
): Promise<void> {
  const zipEntries: Array<{ name: string; data: Uint8Array }> = [];
  for (let i = 0; i < reports.length; i += 1) {
    const item = reports[i];
    const doc = await createExamReportPdfDocument(item);
    const pdfArrayBuffer = doc.output('arraybuffer');
    const safeStudent = (item.studentName || `Student_${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeClass = (item.className || 'Class').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeExam = (item.examTitle || 'Assessment').replace(/[^a-zA-Z0-9_-]/g, '_');
    zipEntries.push({
      name: `${safeClass}/${safeStudent}_${safeExam}_${i + 1}.pdf`,
      data: new Uint8Array(pdfArrayBuffer),
    });
  }

  const content = buildZipArchiveBlob(zipEntries);
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = zipFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ExamReportQuestionRow {
  index: number;
  questionId: string;
  prompt: string;
  studentAnswerText: string;
  officialAnswerText: string;
  pointsAwarded: number;
  maxPoints: number;
  isCorrect: boolean;
  status: 'PASS' | 'PART' | 'FAIL';
}

export interface ExamReportViewModel {
  attemptId: string;
  examTitle: string;
  examSubject: string;
  workType: string;
  workTypeLabel: string;
  studentName: string;
  studentClass: string;
  schoolName: string;
  submittedAtText: string;
  releasedAtText: string;
  evaluationMode: string;
  rawScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  feedbackText: string;
  questionRows: ExamReportQuestionRow[];
}

function normalizeTimestampToIso(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val?.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  return String(val);
}

export function buildExamReportViewModel(
  attempt: Record<string, any> = {},
  exam: Record<string, any> = {}
): ExamReportViewModel {
  const questions = resolveAttemptQuestions(exam, attempt) as ExamReportQuestionItem[];
  const maxScore = computeExamMaxScore(exam, attempt);
  const rawScore = typeof attempt.score === 'number' ? attempt.score : 0;
  const summary = formatScoreSummary(rawScore, maxScore);
  const typeLabels = getWorkTypeLabels(exam?.workType || attempt?.workType, exam);

  const schoolName =
    resolvePartnerSchoolName(exam?.schoolName, attempt?.schoolName, exam?.schoolId, attempt?.schoolId) ||
    exam?.schoolName ||
    attempt?.schoolName ||
    'Jaystarbliss Partner Academy';

  const studentClass = formatNormalizedClassDisplay(
    attempt?.className || exam?.targetClass || exam?.className,
    'General'
  );

  const resultsMap = new Map<string, ExamReportQuestionResult>();
  (Array.isArray(attempt.questionResults) ? attempt.questionResults : []).forEach((r: any) => {
    if (r && r.questionId) resultsMap.set(String(r.questionId), r);
  });
  (Array.isArray(attempt.manualMarks) ? attempt.manualMarks : []).forEach((m: any) => {
    if (m && m.questionId) {
      const existing = resultsMap.get(String(m.questionId));
      resultsMap.set(String(m.questionId), {
        ...(existing || { questionId: String(m.questionId), maxPoints: m.maxPoints || 1 }),
        pointsAwarded: Number(m.pointsAwarded ?? 0),
        maxPoints: Number(m.maxPoints ?? existing?.maxPoints ?? 1),
      });
    }
  });

  const answers = attempt?.answers && typeof attempt.answers === 'object' ? attempt.answers : {};

  const questionRows: ExamReportQuestionRow[] = questions.map((q, idx) => {
    const res = resultsMap.get(q.id);
    const maxPts = Number(res?.maxPoints ?? q.points ?? 1);
    const awardedPts =
      res?.pointsAwarded !== undefined
        ? Number(res.pointsAwarded)
        : res?.correct
        ? maxPts
        : 0;
    const isCorrect = Boolean(res?.correct || (maxPts > 0 && awardedPts >= maxPts));
    const status: 'PASS' | 'PART' | 'FAIL' = isCorrect
      ? 'PASS'
      : awardedPts > 0
      ? 'PART'
      : 'FAIL';

    return {
      index: idx + 1,
      questionId: q.id || `q_${idx + 1}`,
      prompt: String(q.prompt || `Question ${idx + 1}`),
      studentAnswerText: formatAnswerText(q, answers[q.id]),
      officialAnswerText: formatCorrectAnswerText(q),
      pointsAwarded: awardedPts,
      maxPoints: maxPts,
      isCorrect,
      status,
    };
  });

  const submittedIso = normalizeTimestampToIso(attempt.submittedAt);
  const releasedIso = normalizeTimestampToIso(attempt.releasedAt || attempt.updatedAt || attempt.submittedAt);

  return {
    attemptId: String(attempt.id || attempt.attemptId || 'ATTEMPT'),
    examTitle: String(exam.title || attempt.examTitle || typeLabels.singular),
    examSubject: String(exam.subject || attempt.subject || 'General'),
    workType: typeLabels.workType,
    workTypeLabel: typeLabels.singular,
    studentName: String(attempt.studentName || 'Student'),
    studentClass,
    schoolName,
    submittedAtText: formatDateStr(submittedIso),
    releasedAtText: formatDateStr(releasedIso),
    evaluationMode:
      exam.gradingMode === 'manual' || attempt.autoGraded === false
        ? 'Tutor Verified Grading'
        : 'Automated & Verified CBT',
    rawScore,
    maxScore,
    percentage: summary.percentage ?? 0,
    grade: summary.grade,
    feedbackText:
      String(attempt.feedback || attempt.tutorFeedback || attempt.tutorRemark || '').trim(),
    questionRows,
  };
}

export async function generateExamReportPdf(
  attempt: Record<string, any> = {},
  exam: Record<string, any> = {},
  options: {
    headerConfig?: Partial<DocumentHeaderConfig>;
    callerRole?: string;
    includeAnswerKey?: boolean;
  } = {}
): Promise<Uint8Array> {
  const vm = buildExamReportViewModel(attempt, exam);
  const questions = resolveAttemptQuestions(exam, attempt) as ExamReportQuestionItem[];
  const submittedIso = normalizeTimestampToIso(attempt.submittedAt);
  const releasedIso = normalizeTimestampToIso(attempt.releasedAt);

  const doc = await createExamReportPdfDocument({
    attemptId: vm.attemptId,
    examTitle: vm.examTitle,
    subject: vm.examSubject,
    workType: exam.workType || attempt.workType || vm.workType,
    schoolId: String(exam.schoolId || attempt.schoolId || ''),
    schoolName: vm.schoolName,
    className: vm.studentClass,
    studentName: vm.studentName,
    score: vm.rawScore,
    maxScore: vm.maxScore,
    percentage: vm.percentage,
    grade: vm.grade,
    status: String(attempt.status || 'submitted'),
    submittedAt: submittedIso,
    releasedAt: releasedIso,
    resultReleased: Boolean(attempt.resultReleased || attempt.releasedAt),
    callerRole: options.callerRole,
    tutorFeedback: String(attempt.feedback || attempt.tutorFeedback || attempt.tutorRemark || ''),
    questions,
    answers: attempt.answers || {},
    questionResults: vm.questionRows.map((r) => ({
      questionId: r.questionId,
      correct: r.isCorrect,
      pointsAwarded: r.pointsAwarded,
      maxPoints: r.maxPoints,
    })),
    includeAnswerKey: options.includeAnswerKey ?? true,
    headerConfig: options.headerConfig,
  });

  const arrayBuf = doc.output('arraybuffer');
  return new Uint8Array(arrayBuf);
}

