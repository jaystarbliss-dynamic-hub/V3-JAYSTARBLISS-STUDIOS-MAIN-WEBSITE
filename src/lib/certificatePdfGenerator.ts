import { jsPDF } from 'jspdf';
import {
  JDI_COLORS,
  JDI_CONTACTS,
  JDI_INSTITUTION_NAME,
  JDI_INSTITUTION_SUBTITLE,
  sanitizePdfText,
  loadOfficialWatermarkAsset,
  preparePageBackgroundAndWatermark,
} from './pdf';

const makeStableCredentialId = (
  studentId: string | undefined,
  studentName: string,
  moduleTitle: string
) => {
  let hash = 0;
  const source = `${studentId || studentName}:${moduleTitle}`;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `JDS-${hash.toString(36).toUpperCase().padStart(8, '0').slice(-8)}`;
};

export interface ModuleCertificateData {
  studentName: string;
  studentId?: string;
  moduleTitle: string;
  moduleStage?: string;
  programTrack: string;
  competencies?: string[];
  issueDate?: string;
  credentialId?: string;
  instructorName?: string;
}

function drawLandscapeNavyCorners(doc: jsPDF, pageWidth: number, pageHeight: number): void {
  const anyDoc = doc as any;
  if (typeof anyDoc.triangle !== 'function') return;

  // Top-left geometric navy facet
  doc.setFillColor(...JDI_COLORS.NAVY_STEEL);
  anyDoc.triangle(0, 0, 52, 0, 0, 28, 'F');
  doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
  anyDoc.triangle(0, 0, 34, 0, 0, 19, 'F');

  // Bottom-right geometric navy facet
  doc.setFillColor(...JDI_COLORS.NAVY_STEEL);
  anyDoc.triangle(pageWidth - 52, pageHeight, pageWidth, pageHeight - 28, pageWidth, pageHeight, 'F');
  doc.setFillColor(...JDI_COLORS.NAVY_PRIMARY);
  anyDoc.triangle(pageWidth - 34, pageHeight, pageWidth, pageHeight - 19, pageWidth, pageHeight, 'F');
}

function drawVectorSealStar(doc: jsPDF, cx: number, cy: number, outerR: number, innerR: number): void {
  const anyDoc = doc as any;
  if (typeof anyDoc.triangle !== 'function') return;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  doc.setFillColor(...JDI_COLORS.CRIMSON);
  for (let i = 0; i < 10; i += 1) {
    const next = pts[(i + 1) % 10];
    anyDoc.triangle(cx, cy, pts[i][0], pts[i][1], next[0], next[1], 'F');
  }
}

export async function createModuleCertificatePdfDocument(
  data: ModuleCertificateData
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 297 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210 mm
  const centerX = pageWidth / 2;

  const watermarkAsset = await loadOfficialWatermarkAsset();

  const studentName = sanitizePdfText(data.studentName?.trim() || 'Valued Scholar');
  const moduleTitle = sanitizePdfText(
    data.moduleTitle?.trim() || 'Digital Technology & Innovation Module'
  );
  const moduleStage = sanitizePdfText(data.moduleStage?.trim() || 'MASTERY MILESTONE');
  const programTrack = sanitizePdfText(
    data.programTrack?.trim() || 'Jaystarbliss Digital Ecosystem'
  );
  const issueDate = sanitizePdfText(
    data.issueDate ||
      new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
  );
  const credentialId = sanitizePdfText(
    data.credentialId || makeStableCredentialId(data.studentId, studentName, moduleTitle)
  );
  const instructorName = sanitizePdfText(
    data.instructorName || 'Academic Directorate & Lead Mentors'
  );

  // 1. Light Ivory background + Permanent centered watermark behind certificate details
  preparePageBackgroundAndWatermark(doc, watermarkAsset, {
    backgroundRgb: JDI_COLORS.IVORY_BG,
    watermark: { opacity: 0.085, scaleRatio: 0.62, offsetY: 2 },
  });

  // Top-left & bottom-right navy geometric accents
  drawLandscapeNavyCorners(doc, pageWidth, pageHeight);

  // Institutional framing lines (deep navy outer, crimson double accent inner)
  doc.setDrawColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.setLineWidth(1.3);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16, 'S');

  doc.setDrawColor(...JDI_COLORS.CRIMSON);
  doc.setLineWidth(0.75);
  doc.rect(11.5, 11.5, pageWidth - 23, pageHeight - 23, 'S');

  doc.setDrawColor(...JDI_COLORS.BORDER_MID);
  doc.setLineWidth(0.35);
  doc.rect(13.5, 13.5, pageWidth - 27, pageHeight - 27, 'S');

  // Corner Rosettes
  const cornerSize = 12;
  const drawCornerOrnaments = (x: number, y: number, isRight: boolean, isBottom: boolean) => {
    const dirX = isRight ? -1 : 1;
    const dirY = isBottom ? -1 : 1;
    doc.setDrawColor(...JDI_COLORS.NAVY_PRIMARY);
    doc.setLineWidth(0.9);
    doc.line(x, y + dirY * 3.5, x, y + dirY * cornerSize);
    doc.line(x + dirX * 3.5, y, x + dirX * cornerSize, y);
    doc.setFillColor(...JDI_COLORS.CRIMSON);
    doc.circle(x + dirX * 2.5, y + dirY * 2.5, 1.2, 'F');
  };

  drawCornerOrnaments(11.5, 11.5, false, false);
  drawCornerOrnaments(pageWidth - 11.5, 11.5, true, false);
  drawCornerOrnaments(11.5, pageHeight - 11.5, false, true);
  drawCornerOrnaments(pageWidth - 11.5, pageHeight - 11.5, true, true);

  // 2. Institution Brand Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16.5);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.text(JDI_INSTITUTION_NAME, centerX, 26, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...JDI_COLORS.CRIMSON);
  doc.text(JDI_INSTITUTION_SUBTITLE, centerX, 31.5, { align: 'center' });

  doc.setDrawColor(...JDI_COLORS.BORDER_MID);
  doc.setLineWidth(0.5);
  doc.line(centerX - 52, 34.5, centerX + 52, 34.5);

  // 3. Certificate Title
  doc.setFont('times', 'bold');
  doc.setFontSize(22.5);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  doc.text('CERTIFICATE OF MODULE COMPLETION', centerX, 46, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text(`VERIFIED CURRICULUM MILESTONE  •  ${moduleStage.toUpperCase()}`, centerX, 52, {
    align: 'center',
  });

  // 4. Recipient Presentation
  doc.setFont('times', 'italic');
  doc.setFontSize(11.5);
  doc.setTextColor(...JDI_COLORS.INK_BODY);
  doc.text('This credential is officially conferred upon', centerX, 62, { align: 'center' });

  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.text(studentName, centerX, 75.5, { align: 'center', maxWidth: pageWidth - 52 });

  const nameWidth = Math.min(Math.max(doc.getTextWidth(studentName) + 18, 70), 185);
  doc.setDrawColor(...JDI_COLORS.CRIMSON);
  doc.setLineWidth(0.9);
  doc.line(centerX - nameWidth / 2, 79.5, centerX + nameWidth / 2, 79.5);

  // 5. Narrative & Module Banner
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...JDI_COLORS.INK_BODY);
  doc.text(
    'for successfully demonstrating technical proficiency, completing practical laboratory challenges,',
    centerX,
    88,
    { align: 'center' }
  );
  doc.text(
    'and achieving verified mastery in the specialized program module:',
    centerX,
    93.5,
    { align: 'center' }
  );

  doc.setFillColor(...JDI_COLORS.ICE_BG);
  doc.roundedRect(centerX - 88, 99, 176, 18.5, 2.5, 2.5, 'F');
  doc.setDrawColor(...JDI_COLORS.ICE_BORDER);
  doc.setLineWidth(0.4);
  doc.roundedRect(centerX - 88, 99, 176, 18.5, 2.5, 2.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.text(moduleTitle, centerX, 107, { align: 'center', maxWidth: 168 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...JDI_COLORS.CRIMSON);
  doc.text(programTrack, centerX, 113.5, { align: 'center', maxWidth: 168 });

  if (data.competencies && data.competencies.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...JDI_COLORS.INK_MUTED);
    const skillsText = sanitizePdfText(
      `Core Competencies: ${data.competencies.slice(0, 4).join(' • ')}`
    );
    doc.text(skillsText, centerX, 124.5, { align: 'center', maxWidth: pageWidth - 60 });
  }

  // 6. Signatures & Vector Seal
  const sigY = 155;

  doc.setDrawColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.setLineWidth(0.5);
  doc.line(36, sigY, 96, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  doc.text(instructorName, 66, sigY + 5.2, { align: 'center', maxWidth: 62 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text('Lead Technical Instructor / Mentor', 66, sigY + 9.5, { align: 'center' });

  // Center Seal
  const sealX = centerX;
  const sealY = sigY + 2;
  doc.setDrawColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.setLineWidth(1.1);
  doc.circle(sealX, sealY, 13.5, 'S');
  doc.setDrawColor(...JDI_COLORS.CRIMSON);
  doc.setLineWidth(0.45);
  doc.circle(sealX, sealY, 11.4, 'S');

  drawVectorSealStar(doc, sealX, sealY - 4.2, 2.7, 1.15);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.text('VERIFIED', sealX, sealY + 1.8, { align: 'center' });
  doc.text('ACCREDITED', sealX, sealY + 5.4, { align: 'center' });

  // Right Signature
  doc.setDrawColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.setLineWidth(0.5);
  doc.line(pageWidth - 96, sigY, pageWidth - 36, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...JDI_COLORS.INK_DARK);
  doc.text('Academic Directorate', pageWidth - 66, sigY + 5.2, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text('Director of Curriculum & Standards', pageWidth - 66, sigY + 9.5, { align: 'center' });

  // 7. Verification Footer inside certificate frame
  const footerY = pageHeight - 17;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text(`Issue Date: ${issueDate}`, 22, footerY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...JDI_COLORS.NAVY_PRIMARY);
  doc.text(`Credential ID: ${credentialId}`, centerX, footerY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...JDI_COLORS.INK_MUTED);
  doc.text(`Verify at: ${JDI_CONTACTS.verifyUrl}  |  ${JDI_CONTACTS.website}`, pageWidth - 22, footerY, {
    align: 'right',
  });

  return doc;
}

export async function generateModuleCertificatePdf(data: ModuleCertificateData): Promise<void> {
  const doc = await createModuleCertificatePdfDocument(data);
  const safeStudent = (data.studentName?.trim() || 'Scholar').replace(/[^a-zA-Z0-9]/g, '_');
  const safeModule = (data.moduleTitle?.trim() || 'Module')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 24);
  doc.save(`Jaystarbliss_Certificate_${safeStudent}_${safeModule}.pdf`);
}
